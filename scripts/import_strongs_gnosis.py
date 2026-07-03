#!/usr/bin/env python3
"""Gnosis greek-words.json → strongs.sqlite（STEPBible 下载失败时的备选）。

用法：
  python scripts/import_strongs_gnosis.py
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.usfm import parse_osis_ref

REPO = Path(__file__).resolve().parent.parent
CACHE = REPO / "data" / ".cache" / "gnosis-greek-words.json"
OUT = REPO / "data" / "strongs" / "strongs.sqlite"

SCHEMA = """
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS strongs_entries (
  strongs TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  lemma TEXT,
  transliteration TEXT,
  gloss TEXT
);
CREATE TABLE IF NOT EXISTS verse_words (
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  position INTEGER NOT NULL,
  word TEXT,
  strongs TEXT,
  lemma TEXT,
  transliteration TEXT,
  gloss TEXT,
  morphology TEXT,
  PRIMARY KEY (book, chapter, verse, position)
);
CREATE INDEX IF NOT EXISTS idx_verse_words_ref ON verse_words (book, chapter, verse);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def main() -> int:
    if not CACHE.exists():
        print(f"缺少 {CACHE}，请先下载 gnosis greek-words.json")
        return 1
    raw = json.loads(CACHE.read_text(encoding="utf-8"))
    verses = list(raw.values()) if isinstance(raw, dict) else raw

    entries: dict[str, dict] = {}
    verse_rows: list[dict] = []

    for block in verses:
        coord = parse_osis_ref(block.get("osis_ref") or "")
        if not coord:
            continue
        for pos, w in enumerate(block.get("words") or [], start=1):
            strongs = (w.get("strongs_number") or w.get("strongs") or "").strip()
            lemma = w.get("lemma") or ""
            if strongs and strongs not in entries:
                entries[strongs] = {
                    "strongs": strongs,
                    "language": "greek" if strongs.startswith("G") else "hebrew",
                    "lemma": lemma,
                    "transliteration": "",
                    "gloss": lemma,
                }
            verse_rows.append({
                "book": coord.book,
                "chapter": coord.chapter,
                "verse": coord.verse,
                "position": pos,
                "word": w.get("text") or "",
                "strongs": strongs,
                "lemma": lemma,
                "transliteration": "",
                "gloss": lemma,
                "morphology": w.get("morph") or "",
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    conn = sqlite3.connect(OUT)
    conn.executescript(SCHEMA)
    conn.executemany(
        "INSERT OR REPLACE INTO strongs_entries VALUES (?,?,?,?,?)",
        [
            (e["strongs"], e["language"], e["lemma"], e["transliteration"], e["gloss"])
            for e in entries.values()
        ],
    )
    conn.executemany(
        "INSERT OR REPLACE INTO verse_words VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
            (
                r["book"], r["chapter"], r["verse"], r["position"],
                r["word"], r["strongs"], r["lemma"], r["transliteration"],
                r["gloss"], r["morphology"],
            )
            for r in verse_rows
        ],
    )
    conn.execute("INSERT INTO meta VALUES ('source', 'gnosis greek-words (CC-BY-SA)')")
    conn.commit()
    conn.close()
    print(f"✓ Strong's (gnosis)：词条 {len(entries)} / 逐词 {len(verse_rows)} → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
