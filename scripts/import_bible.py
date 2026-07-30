#!/usr/bin/env python3
"""verses.json → 离线 SQLite（books + verses + FTS5）。

用法：
  python scripts/import_bible.py --input data/bible/cnv/verses.json --out build/bible_cnv.sqlite
  python scripts/import_bible.py --input data/bible/kjv/verses.json --out build/bible_kjv.sqlite

生成 schema 与 IMPLEMENTATION-PLAN §7.1 对齐：books / verses / verses_fts(fts5)。
验证：getChapter(JHN, 3) 能取回经文。
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

# eBible VPL / 部分源站书卷码 → 本仓库 canonical（与 cuvs/cnv/kjv 一致）
BOOK_ID_ALIASES: dict[str, str] = {
    "JOH": "JHN",
    "MAR": "MRK",
    "PHI": "PHP",
    "SOL": "SNG",
    "EZE": "EZK",
    "JAM": "JAS",
    "JOE": "JOL",
    "NAH": "NAM",
    "1JO": "1JN",
    "2JO": "2JN",
    "3JO": "3JN",
}

SCHEMA = """
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  testament     TEXT NOT NULL,
  sort_order    INTEGER NOT NULL,
  chapter_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verses (
  book    TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse   INTEGER NOT NULL,
  text    TEXT NOT NULL,
  PRIMARY KEY (book, chapter, verse)
);

CREATE INDEX IF NOT EXISTS idx_verses_book_ch ON verses (book, chapter);

CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
  text,
  book UNINDEXED,
  chapter UNINDEXED,
  verse UNINDEXED,
  tokenize = 'unicode61'
);
"""


def normalize_book_id(raw: str, valid: set[str]) -> str:
    b = (raw or "").strip().upper()
    if b in valid:
        return b
    mapped = BOOK_ID_ALIASES.get(b, b)
    return mapped if mapped in valid else b


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    translation = data["translation"]
    books = data["books"]
    valid_ids = {str(b["id"]).upper() for b in books}

    # 去重（KJV best-effort 解析可能产生重复键，保留首次出现）
    seen: set[tuple] = set()
    verses = []
    dropped = 0
    remapped = 0
    unknown_books: set[str] = set()
    for v in data["verses"]:
        raw_book = str(v["book"])
        book = normalize_book_id(raw_book, valid_ids)
        if book != raw_book.upper():
            remapped += 1
        if book not in valid_ids:
            unknown_books.add(raw_book)
            continue
        key = (book, v["chapter"], v["verse"])
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        verses.append({**v, "book": book})

    if unknown_books:
        raise SystemExit(
            f"未知书卷码（未映射到 books.id）：{sorted(unknown_books)[:20]}"
        )

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()

    conn = sqlite3.connect(out)
    try:
        conn.executescript(SCHEMA)
        conn.executemany(
            "INSERT INTO books (id, name, testament, sort_order, chapter_count)"
            " VALUES (?,?,?,?,?)",
            [(b["id"], b["name"], b["testament"], b["order"], b["chapter_count"])
             for b in books],
        )
        conn.executemany(
            "INSERT INTO verses (book, chapter, verse, text) VALUES (?,?,?,?)",
            [(v["book"], v["chapter"], v["verse"], v["text"]) for v in verses],
        )
        conn.executemany(
            "INSERT INTO verses_fts (text, book, chapter, verse) VALUES (?,?,?,?)",
            [(v["text"], v["book"], v["chapter"], v["verse"]) for v in verses],
        )
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('translation', ?)",
            (translation,),
        )
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('verse_count', ?)",
            (str(len(verses)),),
        )
        conn.execute("INSERT INTO verses_fts(verses_fts) VALUES('optimize')")
        conn.commit()
        conn.execute("VACUUM")

        # ── 验证 ──
        cur = conn.execute(
            "SELECT verse, text FROM verses WHERE book='JHN' AND chapter=3"
            " ORDER BY verse LIMIT 1"
        )
        row = cur.fetchone()
        n = conn.execute("SELECT COUNT(*) FROM verses").fetchone()[0]
        nb = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        fts = conn.execute(
            "SELECT count(*) FROM verses_fts WHERE verses_fts MATCH ?",
            ("God" if translation == "kjv" else "神",),
        ).fetchone()[0]
    finally:
        conn.close()

    print(f"✓ {translation}: {n} 节 / {nb} 卷 → {out} ({out.stat().st_size // 1024} KB)")
    if remapped:
        print(f"  书卷码规范化 {remapped} 节（如 JOH→JHN）")
    if dropped:
        print(f"  ⚠ 跳过重复键 {dropped} 条（best-effort 解析）")
    if row:
        print(f"  getChapter(JHN,3) 首节 v{row[0]} = {row[1][:48]}")
    else:
        print("  ⚠ getChapter(JHN,3) 无结果 — 书卷码可能仍未对齐")
    print(f"  FTS 命中（示例词）= {fts}")


if __name__ == "__main__":
    main()
