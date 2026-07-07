#!/usr/bin/env python3
"""scrollmapper KJV JSON → data/bible/kjv/verses.json（及可选 SQLite）。

数据源：https://github.com/scrollmapper/bible_databases
  formats/json/KJV.json — King James Version (1769), Public Domain

用法：
  python scripts/import_kjv_scrollmapper.py
  python scripts/import_kjv_scrollmapper.py --sqlite build/bible_kjv.sqlite
  python scripts/import_kjv_scrollmapper.py --fetch   # 强制重新下载 JSON
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from epub_to_verses import BOOK_ORDER, BOOK_TESTAMENT, EN_LOOKUP, _norm  # noqa: E402

KJV_URL = (
    "https://raw.githubusercontent.com/scrollmapper/bible_databases/"
    "master/formats/json/KJV.json"
)
CACHE = REPO / "data" / ".cache" / "scrollmapper-kjv.json"
OUT_JSON = REPO / "data" / "bible" / "kjv" / "verses.json"
OUT_SQLITE = REPO / "build" / "bible_kjv.sqlite"

_ROMAN_PREFIX: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^III\s+"), "3 "),
    (re.compile(r"^II\s+"), "2 "),
    (re.compile(r"^I\s+"), "1 "),
)


def _fetch_json(dest: Path) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  下载 {KJV_URL} …", flush=True)
    req = urllib.request.Request(KJV_URL, headers={"User-Agent": "bible-import/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read()
    dest.write_bytes(raw)
    return json.loads(raw.decode("utf-8"))


def _load_scrollmapper(*, fetch: bool = False) -> dict:
    if fetch or not CACHE.exists() or CACHE.stat().st_size < 1000:
        return _fetch_json(CACHE)
    return json.loads(CACHE.read_text(encoding="utf-8"))


def book_id_for_name(name: str) -> str:
    n = name.strip()
    for pat, rep in _ROMAN_PREFIX:
        n = pat.sub(rep, n)
    bid = EN_LOOKUP.get(_norm(n))
    if not bid:
        raise ValueError(f"未知书卷名：{name!r} (normalized={n!r})")
    return bid


def convert(data: dict) -> dict:
    books_out: list[dict] = []
    verses_out: list[dict] = []

    for book in data.get("books", []):
        name = str(book["name"])
        book_id = book_id_for_name(name)
        chapters = book.get("chapters") or []
        books_out.append({
            "id": book_id,
            "name": name,
            "testament": BOOK_TESTAMENT[book_id],
            "order": BOOK_ORDER[book_id],
            "chapter_count": len(chapters),
        })
        for ch in chapters:
            chapter = int(ch["chapter"])
            for v in ch.get("verses") or []:
                verses_out.append({
                    "book": book_id,
                    "chapter": chapter,
                    "verse": int(v["verse"]),
                    "text": str(v["text"]).strip(),
                })

    books_out.sort(key=lambda b: b["order"])
    return {
        "translation": "kjv",
        "source": "scrollmapper/bible_databases formats/json/KJV.json",
        "license": "Public Domain",
        "verses": verses_out,
        "books": books_out,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="强制重新下载 scrollmapper JSON")
    ap.add_argument("--out", type=Path, default=OUT_JSON)
    ap.add_argument("--sqlite", type=Path, default=None, help="同时生成 SQLite（默认不写）")
    args = ap.parse_args()

    raw = _load_scrollmapper(fetch=args.fetch)
    payload = convert(raw)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    n_books = len(payload["books"])
    n_verses = len(payload["verses"])
    print(f"✓ KJV verses.json：{n_verses} 节 / {n_books} 卷 → {args.out}")

    sqlite_out = args.sqlite
    if sqlite_out is None and args.out == OUT_JSON:
        sqlite_out = OUT_SQLITE

    if sqlite_out:
        import subprocess

        subprocess.run(
            [
                sys.executable,
                str(REPO / "scripts" / "import_bible.py"),
                "--input",
                str(args.out),
                "--out",
                str(sqlite_out),
            ],
            check=True,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
