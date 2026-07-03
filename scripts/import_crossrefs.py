#!/usr/bin/env python3
"""OpenBible TSK 交叉引用 → SQLite + 精选 JSON 起步集。

数据源：https://a.openbible.info/data/cross-references.zip (CC-BY)

用法：
  python scripts/import_crossrefs.py
  python scripts/import_crossrefs.py --zip data/.cache/crossrefs.zip --top 12
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.usfm import parse_osis_ref

REPO = Path(__file__).resolve().parent.parent
CACHE = REPO / "data" / ".cache"
DEFAULT_ZIP = CACHE / "crossrefs.zip"
OPENBIBLE_URL = "https://a.openbible.info/data/cross-references.zip"
OUT_SQLITE = REPO / "data" / "crossrefs" / "cross_references.sqlite"
OUT_JSON = REPO / "data" / "crossrefs" / "cross_references.json"

SCHEMA = """
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS crossrefs (
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  related_book TEXT NOT NULL,
  related_chapter INTEGER NOT NULL,
  related_verse INTEGER NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (book, chapter, verse, related_book, related_chapter, related_verse)
);
CREATE INDEX IF NOT EXISTS idx_crossrefs_src ON crossrefs (book, chapter, verse);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def _download(url: str, dest: Path) -> None:
    import urllib.request

    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 100_000:
        print(f"  使用缓存 {dest}")
        return
    print(f"  下载 {url} …")
    urllib.request.urlretrieve(url, dest)


def _read_tsv(zip_path: Path):
    with zipfile.ZipFile(zip_path) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".txt"))
        with zf.open(name) as f:
            lines = f.read().decode("utf-8", errors="replace").splitlines()
    for line in lines[1:]:
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        src, dst, votes_s = parts[0], parts[1], parts[2]
        try:
            votes = int(votes_s)
        except ValueError:
            votes = 0
        src_c = parse_osis_ref(src)
        dst_c = parse_osis_ref(dst)
        if src_c and dst_c:
            yield src_c, dst_c, votes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", type=Path, default=DEFAULT_ZIP)
    ap.add_argument("--top", type=int, default=12, help="JSON 起步集每节保留条数")
    ap.add_argument("--json-top-verses", type=int, default=500,
                    help="JSON 起步集覆盖有引用的经节数（按票数排序）")
    args = ap.parse_args()

    if not args.zip.exists():
        _download(OPENBIBLE_URL, args.zip)

    grouped: dict[tuple, list[tuple[tuple, int]]] = defaultdict(list)
    total = 0
    for src, dst, votes in _read_tsv(args.zip):
        key = (src.book, src.chapter, src.verse)
        dst_key = (dst.book, dst.chapter, dst.verse)
        grouped[key].append((dst_key, votes))
        total += 1

    OUT_SQLITE.parent.mkdir(parents=True, exist_ok=True)
    if OUT_SQLITE.exists():
        OUT_SQLITE.unlink()
    conn = sqlite3.connect(OUT_SQLITE)
    conn.executescript(SCHEMA)
    rows = []
    for (book, ch, v), items in grouped.items():
        for (rb, rc, rv), votes in items:
            rows.append((book, ch, v, rb, rc, rv, votes))
    conn.executemany(
        "INSERT OR REPLACE INTO crossrefs VALUES (?,?,?,?,?,?,?)", rows
    )
    conn.execute(
        "INSERT INTO meta VALUES ('source', 'OpenBible.info / Treasury of Scripture Knowledge')"
    )
    conn.execute("INSERT INTO meta VALUES ('license', 'CC-BY')")
    conn.execute("INSERT INTO meta VALUES ('rows', ?)", (str(len(rows)),))
    conn.commit()
    conn.execute("VACUUM")
    conn.close()

    # 高票经节 → JSON 起步集（兼容旧 loader / 离线包）
    verse_scores: dict[tuple, int] = {}
    for key, items in grouped.items():
        verse_scores[key] = sum(v for _, v in items)
    top_verses = sorted(verse_scores, key=verse_scores.get, reverse=True)[
        : args.json_top_verses
    ]
    references = []
    for book, ch, v in top_verses:
        items = sorted(grouped[(book, ch, v)], key=lambda x: -x[1])[: args.top]
        ref = f"{book} {ch}:{v}"
        related = [f"{rb} {rc}:{rv}" for (rb, rc, rv), _ in items]
        references.append({"ref": ref, "label": ref, "related": related})

    OUT_JSON.write_text(
        __import__("json").dumps(
            {
                "schema": "cross_references@2",
                "source": "OpenBible.info (CC-BY)",
                "sqlite": "cross_references.sqlite",
                "note": f"起步集 {len(references)} 节；完整数据见 SQLite",
                "references": references,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"✓ 交叉引用：{total} 条原始 / {len(rows)} 条入库 → {OUT_SQLITE}")
    print(f"  JSON 起步集 {len(references)} 节 → {OUT_JSON}")
    print(f"  SQLite 大小 {OUT_SQLITE.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
