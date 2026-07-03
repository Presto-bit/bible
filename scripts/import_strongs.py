#!/usr/bin/env python3
"""Strong's + 逐词数据 → SQLite。

数据源：STEPBible TAGNT (CC-BY) + Brief Extended Strong's lexicons

用法：
  python scripts/import_strongs.py
"""
from __future__ import annotations

import argparse
import re
import sqlite3
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.usfm import parse_osis_ref

REPO = Path(__file__).resolve().parent.parent
CACHE = REPO / "data" / ".cache"
OUT = REPO / "data" / "strongs" / "strongs.sqlite"

TAGNT_URLS = [
    (
        "TAGNT-Mat-Jhn.txt",
        "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
        "Translators%20Amalgamated%20OT%2BNT/"
        "TAGNT%20Mat-Jhn%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt",
    ),
    (
        "TAGNT-Act-Rev.txt",
        "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
        "Translators%20Amalgamated%20OT%2BNT/"
        "TAGNT%20Act-Rev%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt",
    ),
]
TBESG_URL = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/"
    "TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20"
    "-%20STEPBible.org%20CC%20BY.txt"
)
TBESH_URL = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/"
    "TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20"
    "-%20STEPBible.org%20CC%20BY.txt"
)

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


def _fetch(name: str, url: str) -> Path:
    dest = CACHE / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists() or dest.stat().st_size < 500:
        print(f"  下载 {name} …")
        try:
            urllib.request.urlretrieve(url, dest)
        except Exception as exc:
            print(f"  ⚠ 下载失败 {name}: {exc}")
    return dest


def _load_lexicon(path: Path, lang: str) -> dict[str, dict]:
    """TBESG/TBESH: Strong's \\t lemma \\t translit \\t gloss …"""
    entries: dict[str, dict] = {}
    if not path.exists():
        return entries
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip() or line.startswith("#") or line.startswith("Strong"):
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        sid = parts[0].strip()
        if not re.match(r"^[GH]\d+", sid):
            continue
        entries[sid] = {
            "strongs": sid,
            "language": lang,
            "lemma": parts[1].strip() if len(parts) > 1 else "",
            "transliteration": parts[2].strip() if len(parts) > 2 else "",
            "gloss": parts[3].strip() if len(parts) > 3 else "",
        }
    return entries


def _parse_tagnt(path: Path) -> list[dict]:
    """TAGNT 行：Ref \\t Greek \\t Transliteration \\t English \\t Strong \\t Morph …"""
    rows: list[dict] = []
    if not path.exists():
        return rows
    pos_counter: dict[tuple, int] = defaultdict(int)
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip() or line.startswith("#") or line.startswith("Ref"):
            continue
        parts = line.split("\t")
        if len(parts) < 5:
            continue
        coord = parse_osis_ref(parts[0].strip())
        if not coord:
            continue
        key = (coord.book, coord.chapter, coord.verse)
        pos_counter[key] += 1
        rows.append({
            "book": coord.book,
            "chapter": coord.chapter,
            "verse": coord.verse,
            "position": pos_counter[key],
            "word": parts[1].strip() if len(parts) > 1 else "",
            "transliteration": parts[2].strip() if len(parts) > 2 else "",
            "gloss": parts[3].strip() if len(parts) > 3 else "",
            "strongs": parts[4].strip() if len(parts) > 4 else "",
            "lemma": parts[1].strip() if len(parts) > 1 else "",
            "morphology": parts[5].strip() if len(parts) > 5 else "",
        })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    args = ap.parse_args()

    greek_lex = _load_lexicon(_fetch("TBESG.txt", TBESG_URL), "greek")
    hebrew_lex = _load_lexicon(_fetch("TBESH.txt", TBESH_URL), "hebrew")
    all_lex = {**greek_lex, **hebrew_lex}

    verse_rows: list[dict] = []
    for fname, url in TAGNT_URLS:
        verse_rows.extend(_parse_tagnt(_fetch(fname, url)))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    conn = sqlite3.connect(OUT)
    conn.executescript(SCHEMA)
    if all_lex:
        conn.executemany(
            "INSERT OR REPLACE INTO strongs_entries VALUES (?,?,?,?,?)",
            [
                (e["strongs"], e["language"], e["lemma"], e["transliteration"], e["gloss"])
                for e in all_lex.values()
            ],
        )
    for row in verse_rows:
        s = row["strongs"]
        if s and s in all_lex:
            row["lemma"] = all_lex[s].get("lemma") or row["lemma"]
            row["gloss"] = all_lex[s].get("gloss") or row["gloss"]
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
    conn.execute("INSERT INTO meta VALUES ('source', 'STEPBible.org (CC-BY)')")
    conn.execute("INSERT INTO meta VALUES ('verse_words', ?)", (str(len(verse_rows)),))
    conn.commit()
    conn.execute("VACUUM")
    conn.close()

    print(f"✓ Strong's：词条 {len(all_lex)} / 逐词 {len(verse_rows)} → {OUT}")
    if OUT.exists():
        print(f"  SQLite {OUT.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
