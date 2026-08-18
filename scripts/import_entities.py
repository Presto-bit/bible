#!/usr/bin/env python3
"""Gnosis 人物/地点 + STEPBible 词表 → entities.json 扩充。

数据源：
  - gnosis people.json / places.json (CC-BY-SA, spearssoftware/gnosis v0.9.3)
  - 保留现有 data/dictionary/entities.json 手工词条

用法：
  python scripts/import_entities.py
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.bible_names_zh import FEATURE_ZH, TYPE_ZH, zh_name
from lib.usfm import parse_osis_ref, slugify

REPO = Path(__file__).resolve().parent.parent
CACHE = REPO / "data" / ".cache"
VENDOR = REPO / "data" / "vendor"
OUT = REPO / "data" / "dictionary" / "entities.json"
EXISTING = OUT

# 离线/vendor 回退（CC-BY-SA Gnosis v0.9.3）；发版机无出网时 import_relations 仍可用
VENDOR_FILES: dict[str, str] = {
    "gnosis-people.json": "gnosis-people-v0.9.3.json",
    "gnosis-places.json": "gnosis-places-v0.9.3.json",
}

PEOPLE_URL = (
    "https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/people.json"
)
PLACES_URL = (
    "https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/places.json"
)


def _ensure_cache_dir() -> Path:
    try:
        CACHE.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        # 卷挂载只读或父目录异常时，回落系统临时目录（仍可读 vendor）
        fallback = Path(tempfile.gettempdir()) / "peiai-gnosis-cache"
        fallback.mkdir(parents=True, exist_ok=True)
        print(f"  ⚠ data/.cache 不可用（{exc}），改用 {fallback}")
        return fallback
    return CACHE


def _json_ok(path: Path, *, min_bytes: int = 1000) -> bool:
    if not path.exists() or path.stat().st_size < min_bytes:
        return False
    try:
        json.loads(path.read_text(encoding="utf-8"))
        return True
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False


def _vendor_source(name: str) -> Path | None:
    vendor_name = VENDOR_FILES.get(name, name)
    src = VENDOR / vendor_name
    if not src.is_file():
        return None
    if not _json_ok(src, min_bytes=100):
        return None
    return src


def seed_gnosis_cache() -> None:
    """把 vendor 快照写入 data/.cache（发版/容器启动时调用）。"""
    cache = _ensure_cache_dir()
    for name in VENDOR_FILES:
        dest = cache / name
        if _json_ok(dest):
            continue
        src = _vendor_source(name)
        if src is None:
            continue
        try:
            shutil.copy2(src, dest)
            print(f"  预热缓存 {name} ← {src.name}")
        except OSError as exc:
            print(f"  ⚠ 无法写入缓存 {name}：{exc}")


def read_gnosis_data(name: str, url: str) -> object:
    """读 Gnosis JSON：cache → vendor（直读）→ 网络下载。"""
    cache = _ensure_cache_dir()
    dest = cache / name
    if _json_ok(dest):
        return json.loads(dest.read_text(encoding="utf-8"))

    src = _vendor_source(name)
    if src is not None:
        print(f"  使用 vendor 回退 {src.name}")
        try:
            shutil.copy2(src, dest)
        except OSError:
            pass
        return json.loads(src.read_text(encoding="utf-8"))

    path = _fetch(url, name)
    return json.loads(path.read_text(encoding="utf-8"))


def _copy_vendor(name: str, dest: Path) -> bool:
    src = _vendor_source(name)
    if src is None:
        return False
    _ensure_cache_dir()
    shutil.copy2(src, dest)
    print(f"  使用 vendor 回退 {src.name}")
    return True


def _fetch(url: str, name: str, *, min_bytes: int = 1000) -> Path:
    """下载到 data/.cache；已有完整 JSON / vendor 回退则复用。损坏/截断缓存会删掉重下。"""
    cache = _ensure_cache_dir()
    dest = cache / name

    if _json_ok(dest, min_bytes=min_bytes):
        return dest

    if dest.exists():
        print(f"  缓存损坏或过小，重新下载 {name} …")
        dest.unlink(missing_ok=True)
    elif _copy_vendor(name, dest) and _json_ok(dest, min_bytes=min_bytes):
        return dest
    else:
        print(f"  下载 {name} …")

    tmp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            delete=False,
            dir=cache,
            prefix=f"{dest.stem}.",
            suffix=".tmp",
        ) as fh:
            tmp = Path(fh.name)
        urllib.request.urlretrieve(url, tmp)
        if not _json_ok(tmp, min_bytes=min_bytes):
            raise OSError(f"下载内容不是完整 JSON：{name}（{tmp.stat().st_size} bytes）")
        tmp.replace(dest)
        tmp = None
    except Exception:
        if tmp is not None and tmp.exists():
            tmp.unlink(missing_ok=True)
        if _copy_vendor(name, dest) and _json_ok(dest, min_bytes=min_bytes):
            print(f"  下载失败，已改用 vendor 回退 {name}")
            return dest
        raise
    return dest


def _refs_from_osis_list(raw: list[str]) -> list[str]:
    out: list[str] = []
    for item in raw or []:
        c = parse_osis_ref(item)
        if c:
            out.append(c.usfm_ref)
    return out


def _scope_books(refs: list[str]) -> list[str]:
    books = sorted({r.split()[0] for r in refs if " " in r})
    return books[:12]


def _person_summary(zh: str, en: str, p: dict) -> str:
    bits: list[str] = []
    if p.get("birth_year_display"):
        bits.append(f"约 {p['birth_year_display']}")
    gender = FEATURE_ZH.get(p.get("gender") or "", "")
    if gender:
        bits.append(gender)
    extra = "，".join(bits)
    if extra:
        return f"圣经中的人物「{zh}」（{extra}）。"
    return f"圣经中的人物「{zh}」。"


def _place_summary(zh: str, p: dict) -> str:
    ft = FEATURE_ZH.get(p.get("feature_type") or "", "") or TYPE_ZH["place"]
    sub = p.get("feature_sub_type")
    if sub:
        return f"圣经中的地点「{zh}」（{ft}，{sub}）。"
    return f"圣经中的地点「{zh}」（{ft}）。"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-people", type=int, default=800)
    ap.add_argument("--max-places", type=int, default=400)
    args = ap.parse_args()

    people = json.loads(_fetch(PEOPLE_URL, "gnosis-people.json").read_text(encoding="utf-8"))
    places = json.loads(_fetch(PLACES_URL, "gnosis-places.json").read_text(encoding="utf-8"))

    existing: list[dict] = []
    if EXISTING.exists():
        existing = json.loads(EXISTING.read_text(encoding="utf-8")).get("entities", [])

    seen_ids = {e["id"] for e in existing}
    merged = list(existing)

    def add_entity(ent: dict) -> None:
        if ent["id"] in seen_ids:
            return
        seen_ids.add(ent["id"])
        merged.append(ent)

    # 人物：按经节提及数排序
    people_list = list(people.values()) if isinstance(people, dict) else people
    people_list.sort(key=lambda p: len(p.get("verses") or []), reverse=True)
    for p in people_list[: args.max_people]:
        refs = _refs_from_osis_list(p.get("verses") or [])
        if not refs:
            continue
        en = (p.get("name") or p.get("id") or "").strip()
        zh = zh_name(en)
        if not zh:
            continue  # 无中文译名则不入库，避免英文空壳词条
        add_entity({
            "id": slugify(p.get("id") or en),
            "name": zh,
            "type": "person",
            "summary": _person_summary(zh, en, p),
            "refs": refs[:20],
            "scope_books": _scope_books(refs),
            "aliases": [en] if zh != en else [],
            "source": "gnosis",
        })

    # 地点
    places_list = list(places.values()) if isinstance(places, dict) else places
    places_list.sort(key=lambda p: len(p.get("verses") or []), reverse=True)
    for p in places_list[: args.max_places]:
        refs = _refs_from_osis_list(p.get("verses") or [])
        if not refs:
            continue
        en = (p.get("name") or p.get("kjv_name") or p.get("id") or "").strip()
        zh = zh_name(en)
        if not zh:
            continue
        ent: dict = {
            "id": slugify(p.get("id") or en),
            "name": zh,
            "type": "place",
            "summary": _place_summary(zh, p),
            "refs": refs[:20],
            "scope_books": _scope_books(refs),
            "aliases": list({a for a in (p.get("aliases") or []) + ([en] if zh != en else []) if a}),
            "source": "gnosis",
        }
        if p.get("latitude") is not None and p.get("longitude") is not None:
            ent["latitude"] = p["latitude"]
            ent["longitude"] = p["longitude"]
        add_entity(ent)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "schema": "entities@2",
                "source": "手工 + gnosis (CC-BY-SA)",
                "count": len(merged),
                "entities": merged,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"✓ 词典：{len(existing)} 手工 + {len(merged) - len(existing)} 新增 → {len(merged)} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
