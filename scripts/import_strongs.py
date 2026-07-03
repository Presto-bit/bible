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
TAHOT_URLS = [
    (
        "TAHOT-Gen-Deu.txt",
        "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
        "Translators%20Amalgamated%20OT%2BNT/"
        "TAHOT%20Gen-Deu%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt",
        {"GEN", "EXO", "LEV", "NUM", "DEU"},
    ),
    (
        "TAHOT-Job-Sng.txt",
        "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
        "Translators%20Amalgamated%20OT%2BNT/"
        "TAHOT%20Job-Sng%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt",
        {"JOB", "PSA", "PRO", "ECC", "SNG"},
    ),
]
TAHOT_P0_BOOKS = {"GEN", "PSA"}
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
        ref_part = parts[0].strip().split("#")[0]
        coord = parse_osis_ref(ref_part)
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
            "strongs": _extract_strongs(parts[4].strip() if len(parts) > 4 else ""),
            "lemma": parts[1].strip() if len(parts) > 1 else "",
            "morphology": parts[5].strip() if len(parts) > 5 else "",
        })
    return rows


def _extract_strongs(raw: str) -> str:
    """从 Strong 列提取首个 G/H 编号（如 G0976=N-NSF 或 H9003/{H7225G}）。"""
    for part in re.findall(r"[GH]\d+[A-Z]?", raw or ""):
        return part
    return ""


def _extract_hebrew_strongs(raw: str) -> str:
    return _extract_strongs(raw)


def _parse_tahot(path: Path, *, books: set[str] | None = None) -> list[dict]:
    """TAHOT 行：Gen.1.1#01=L \\t Hebrew \\t Translit \\t English \\t Strong …"""
    rows: list[dict] = []
    if not path.exists():
        return rows
    pos_counter: dict[tuple, int] = defaultdict(int)
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip() or line.startswith("#") or line.startswith("Ref:"):
            continue
        if not re.match(r"^[A-Za-z0-9]+\.\d+\.\d+#", line):
            continue
        parts = line.split("\t")
        if len(parts) < 5:
            continue
        ref_part = parts[0].strip().split("#")[0]
        coord = parse_osis_ref(ref_part)
        if not coord:
            continue
        if books and coord.book not in books:
            continue
        key = (coord.book, coord.chapter, coord.verse)
        pos_counter[key] += 1
        strongs = _extract_hebrew_strongs(parts[4].strip())
        rows.append({
            "book": coord.book,
            "chapter": coord.chapter,
            "verse": coord.verse,
            "position": pos_counter[key],
            "word": parts[1].strip() if len(parts) > 1 else "",
            "transliteration": parts[2].strip() if len(parts) > 2 else "",
            "gloss": parts[3].strip() if len(parts) > 3 else "",
            "strongs": strongs,
            "lemma": parts[1].strip() if len(parts) > 1 else "",
            "morphology": parts[5].strip() if len(parts) > 5 else "",
        })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--ot-books",
        default="",
        help="旧约逐词书卷过滤，逗号分隔；默认 P0=GEN,PSA",
    )
    args = ap.parse_args()
    ot_filter = (
        {b.strip().upper() for b in args.ot_books.split(",") if b.strip()}
        if args.ot_books
        else TAHOT_P0_BOOKS
    )

    greek_lex = _load_lexicon(_fetch("TBESG.txt", TBESG_URL), "greek")
    hebrew_lex = _load_lexicon(_fetch("TBESH.txt", TBESH_URL), "hebrew")
    all_lex = {**greek_lex, **hebrew_lex}

    verse_rows: list[dict] = []
    for fname, url in TAGNT_URLS:
        verse_rows.extend(_parse_tagnt(_fetch(fname, url)))
    for fname, url, file_books in TAHOT_URLS:
        books = ot_filter & file_books if ot_filter else file_books
        if not books:
            continue
        verse_rows.extend(_parse_tahot(_fetch(fname, url), books=books))

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
