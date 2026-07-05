#!/usr/bin/env python3
"""OpenChristianData 公版资料 → content/commentary/*.md（供 RAG 索引）。

数据源：https://github.com/OpenChristianData/open-christian-data
  - 注释：Wesley、Calvin、Barnes、Expositor's、Treasury of David、MacLaren 等
  - 参考：Easton's、Smith's、Torrey's、Hitchcock's

与 HelloAO 重复的 MH/JFB/Gill/K&D/Clarke 跳过。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.usfm import normalize_osis_book, osis_to_usfm_book

REPO = Path(__file__).resolve().parent.parent
OUT_COMMENTARY = REPO / "content" / "commentary" / "public-domain-ocd"
OUT_REFERENCE = REPO / "content" / "commentary" / "reference-en"
OCD_RAW = "https://raw.githubusercontent.com/OpenChristianData/open-christian-data/main/data"
GH_API = "https://api.github.com/repos/OpenChristianData/open-christian-data/contents"

# 目录型注释（每卷一个 json）
COMMENTARY_DIRS = [
    "wesley",
    "calvin",
    "barnes",
    "expositors-bible",
    "treasury-of-david",
    "robertson-word-pictures-vol1",
    "lightfoot-colossians-philemon",
]

REFERENCE_FILES = [
    "eastons-bible-dictionary.json",
    "smiths-bible-dictionary.json",
    "torreys-topical-textbook.json",
    "hitchcocks-bible-names-dictionary.json",
]

SERMON_FILES = [
    ("sermons/maclaren-expositions.json", "maclaren-expositions"),
]


def _fetch_json_url(url: str) -> dict | list:
    req = urllib.request.Request(url, headers={"User-Agent": "bible-import/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def _list_github_dir(path: str) -> list[str]:
    url = f"{GH_API}/{path}?ref=main"
    data = _fetch_json_url(url)
    if not isinstance(data, list):
        return []
    return [x["name"] for x in data if x.get("type") == "file" and x["name"].endswith(".json")]


def _osis_usfm(raw: str | None) -> str:
    if not raw:
        return ""
    norm = normalize_osis_book(raw.strip())
    if not norm:
        return raw.upper()[:3]
    usfm = osis_to_usfm_book(norm)
    return usfm or raw.upper()


def _entry_header(entry: dict) -> str:
    book = _osis_usfm(entry.get("book_osis") or entry.get("book"))
    ch = entry.get("chapter")
    vr = (entry.get("verse_range") or entry.get("verse_range_osis") or "").strip()
    if book and ch:
        if vr and vr != str(ch):
            return f"## {book} {ch}:{vr.split('.')[-1] if '.' in vr else vr}"
        return f"## {book} {ch}"
    if entry.get("title"):
        return f"## {entry['title']}"
    return "## Section"


def _commentary_entries_to_md(label: str, entries: list[dict]) -> str:
    lines = [f"# {label}\n"]
    for ent in entries:
        text = (ent.get("commentary_text") or ent.get("text") or "").strip()
        if not text:
            blocks = ent.get("content_blocks") or []
            text = "\n\n".join(str(b).strip() for b in blocks if str(b).strip())
        if not text:
            continue
        lines.append(f"{_entry_header(ent)}\n\n{text}\n")
    return "\n".join(lines)


def _reference_to_md(label: str, entries: list[dict]) -> str:
    lines = [f"# {label}\n"]
    for ent in entries:
        term = (ent.get("term") or ent.get("topic") or ent.get("title") or "").strip()
        blocks = ent.get("definition_blocks") or ent.get("text_blocks") or []
        if isinstance(ent.get("text"), str):
            blocks = [ent["text"]]
        body = "\n\n".join(str(b).strip() for b in blocks if str(b).strip())
        if not term or not body:
            continue
        lines.append(f"## {term}\n\n{body}\n")
    return "\n".join(lines)


def _import_commentary_dir(source: str, *, skip_existing: bool) -> int:
    files = _list_github_dir(f"data/commentaries/{source}")
    if not files:
        print(f"  ⚠ 无文件：{source}", flush=True)
        return 0
    dest = OUT_COMMENTARY / source
    dest.mkdir(parents=True, exist_ok=True)
    n = 0
    label = source.replace("-", " ").title()
    for fname in sorted(files):
        out = dest / fname.replace(".json", ".md")
        if skip_existing and out.exists() and out.stat().st_size > 200:
            continue
        url = f"{OCD_RAW}/commentaries/{source}/{fname}"
        try:
            payload = _fetch_json_url(url)
        except (urllib.error.URLError, json.JSONDecodeError) as exc:
            print(f"  ⚠ {source}/{fname}: {exc}", flush=True)
            continue
        entries = payload.get("data") if isinstance(payload, dict) else payload
        if not isinstance(entries, list) or not entries:
            continue
        out.write_text(_commentary_entries_to_md(f"{label} — {fname}", entries), encoding="utf-8")
        n += 1
        time.sleep(0.05)
    print(f"  ✓ {source}: {n} 卷 → {dest}", flush=True)
    return n


def _import_reference(fname: str, *, skip_existing: bool) -> bool:
    OUT_REFERENCE.mkdir(parents=True, exist_ok=True)
    out = OUT_REFERENCE / fname.replace(".json", ".md")
    if skip_existing and out.exists() and out.stat().st_size > 500:
        return False
    url = f"{OCD_RAW}/reference/{fname}"
    payload = _fetch_json_url(url)
    entries = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        return False
    label = fname.replace(".json", "").replace("-", " ").title()
    out.write_text(_reference_to_md(label, entries), encoding="utf-8")
    print(f"  ✓ reference: {fname} ({len(entries)} 条)", flush=True)
    return True


def _import_maclaren(*, skip_existing: bool) -> bool:
    rel, slug = SERMON_FILES[0]
    OUT_COMMENTARY.mkdir(parents=True, exist_ok=True)
    out = OUT_COMMENTARY / f"{slug}.md"
    if skip_existing and out.exists() and out.stat().st_size > 1000:
        return False
    payload = _fetch_json_url(f"{OCD_RAW}/{rel}")
    entries = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        return False
    lines = ["# MacLaren Expositions of Holy Scripture\n"]
    for ent in entries:
        title = (ent.get("title") or "").strip()
        series = (ent.get("series") or "").strip()
        blocks = ent.get("content_blocks") or []
        body = "\n\n".join(str(b).strip() for b in blocks if str(b).strip())
        if not title or not body:
            continue
        hdr = f"## {title}"
        if series:
            hdr += f" ({series})"
        lines.append(f"{hdr}\n\n{body}\n")
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"  ✓ maclaren: {len(entries)} 篇 → {out.name}", flush=True)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-existing", action="store_true")
    ap.add_argument("--reference-only", action="store_true")
    ap.add_argument("--commentary-only", action="store_true")
    args = ap.parse_args()

    total = 0
    if not args.reference_only:
        for src in COMMENTARY_DIRS:
            total += _import_commentary_dir(src, skip_existing=args.skip_existing)
        if _import_maclaren(skip_existing=args.skip_existing):
            total += 1

    if not args.commentary_only:
        for fname in REFERENCE_FILES:
            if _import_reference(fname, skip_existing=args.skip_existing):
                total += 1

    print(f"✓ OpenChristianData 导入完成（约 {total} 个资源）→ {OUT_COMMENTARY} / {OUT_REFERENCE}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
