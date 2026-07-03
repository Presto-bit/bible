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
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.usfm import parse_osis_ref, slugify

REPO = Path(__file__).resolve().parent.parent
CACHE = REPO / "data" / ".cache"
OUT = REPO / "data" / "dictionary" / "entities.json"
EXISTING = OUT

PEOPLE_URL = (
    "https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/people.json"
)
PLACES_URL = (
    "https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/places.json"
)

# 常见英文名 → 中文（高频词条；其余保留英文）
NAME_ZH: dict[str, str] = {
    "Aaron": "亚伦", "Abraham": "亚伯拉罕", "Adam": "亚当", "David": "大卫",
    "Elijah": "以利亚", "Elisha": "以利沙", "Esther": "以斯帖", "Eve": "夏娃",
    "Isaac": "以撒", "Jacob": "雅各", "Jerusalem": "耶路撒冷", "Jesus": "耶稣",
    "John": "约翰", "Jonah": "约拿", "Joseph": "约瑟", "Joshua": "约书亚",
    "Moses": "摩西", "Noah": "挪亚", "Paul": "保罗", "Peter": "彼得",
    "Samuel": "撒母耳", "Solomon": "所罗门", "Bethlehem": "伯利恒",
    "Babylon": "巴比伦", "Egypt": "埃及", "Galilee": "加利利", "Jordan": "约旦河",
    "Nazareth": "拿撒勒", "Samaria": "撒玛利亚", "Sinai": "西奈", "Zion": "锡安",
}


def _fetch(url: str, name: str) -> Path:
    dest = CACHE / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists() or dest.stat().st_size < 1000:
        print(f"  下载 {name} …")
        urllib.request.urlretrieve(url, dest)
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


def _zh_name(name: str) -> str:
    return NAME_ZH.get(name.strip(), name.strip())


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
        zh = _zh_name(en)
        summary_parts = []
        if p.get("birth_year_display"):
            summary_parts.append(f"约 {p['birth_year_display']}")
        if p.get("gender"):
            summary_parts.append(p["gender"])
        summary = "；".join(summary_parts) or f"圣经人物（{en}）"
        add_entity({
            "id": slugify(p.get("id") or en),
            "name": zh if zh != en else en,
            "type": "person",
            "summary": summary,
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
        zh = _zh_name(en)
        ft = p.get("feature_type") or "Place"
        summary = f"{ft}" + (f"（{p.get('feature_sub_type')}）" if p.get("feature_sub_type") else "")
        ent: dict = {
            "id": slugify(p.get("id") or en),
            "name": zh if zh != en else en,
            "type": "place",
            "summary": summary,
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
