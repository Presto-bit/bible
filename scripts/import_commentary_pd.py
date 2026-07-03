#!/usr/bin/env python3
"""公版英文注释 → content/commentary/public-domain/*.md（供 RAG 索引）。

数据源：HelloAO Bible API (public domain)
  https://bible.helloao.org/api/

用法：
  python scripts/import_commentary_pd.py
  python scripts/import_commentary_pd.py --books JHN MAT ROM --source matthew-henry
  python scripts/rag_index.py --dir content/commentary/public-domain --source-type commentary
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

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "content" / "commentary" / "public-domain"
API = "https://bible.helloao.org/api/c"

SOURCES = {
    "matthew-henry": "Matthew Henry's Complete Commentary",
    "jamieson-fausset-brown": "Jamieson-Fausset-Brown Commentary",
    "john-gill": "John Gill's Exposition",
    "keil-delitzsch": "Keil & Delitzsch OT Commentary",
}

DEFAULT_BOOKS = ["JHN", "MAT", "ROM", "PSA", "GEN"]


def _fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "bible-import/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def _flatten_content(content) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return " ".join(_flatten_content(c) for c in content).strip()
    if isinstance(content, dict):
        return _flatten_content(content.get("content", ""))
    return ""


def _chapter_to_md(source_label: str, book: str, chapter: int, data: dict) -> str:
    ch = data.get("chapter") or {}
    lines = [f"# {source_label} — {book} {chapter}\n"]
    intro = _flatten_content(ch.get("introduction"))
    if intro:
        lines.append(f"## {book} {chapter} (Introduction)\n\n{intro}\n")
    for block in ch.get("content") or []:
        if block.get("type") == "verse" and block.get("number"):
            text = _flatten_content(block.get("content"))
            if text:
                lines.append(f"## {book} {chapter}:{block['number']}\n\n{text}\n")
        elif block.get("type") == "heading":
            text = _flatten_content(block.get("content"))
            if text:
                lines.append(f"## {book} {chapter} — {text}\n")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="matthew-henry")
    ap.add_argument("--books", nargs="*", default=DEFAULT_BOOKS)
    ap.add_argument("--max-chapters", type=int, default=0, help="每卷最多章数，0=全卷")
    ap.add_argument("--delay", type=float, default=0.12)
    args = ap.parse_args()

    source = args.source
    label = SOURCES.get(source, source)
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {
        "id": source,
        "title": label,
        "language": "en",
        "source_type": "commentary",
        "rights": "public-domain",
        "api": "https://bible.helloao.org",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    total = 0
    for book in args.books:
        book = book.upper()
        book_file = OUT / f"{source}-{book.lower()}.md"
        chunks: list[str] = []
        max_ch = args.max_chapters or 200
        for ch in range(1, max_ch + 1):
            url = f"{API}/{source}/{book}/{ch}.json"
            try:
                data = _fetch_json(url)
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    break
                print(f"  ⚠ {book} {ch}: HTTP {exc.code}")
                break
            except Exception as exc:
                print(f"  ⚠ {book} {ch}: {exc}")
                break
            md = _chapter_to_md(label, book, ch, data)
            if md.count("##") <= 1:
                break
            chunks.append(md)
            total += md.count("##") - 1
            time.sleep(args.delay)
        if chunks:
            book_file.write_text("\n\n".join(chunks), encoding="utf-8")
            print(f"  ✓ {book} → {book_file.name} ({len(chunks)} 章)")

    print(f"✓ 公版注释：{total} 段 → {OUT}")
    print("  下一步：make rag-index-pd")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
