#!/usr/bin/env python3
"""信望爱站注释（book=3）→ content/commentary/fhl-zh/*.md。

API：https://bkbible.fhl.net/api/sc.php（需 engs 参数）
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.fhl_books import fhl_books_source, load_fhl_books

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "content" / "commentary" / "fhl-zh"
API = "https://bkbible.fhl.net/api/sc.php"
FHL_COMMENTARY_BOOK = 3
LABEL = "信望爱站注释"

CHAPTER_COUNTS: dict[str, int] = {
    "GEN": 50, "EXO": 40, "LEV": 27, "NUM": 36, "DEU": 34,
    "JOS": 24, "JDG": 21, "RUT": 4, "1SA": 31, "2SA": 24,
    "1KI": 22, "2KI": 25, "1CH": 29, "2CH": 36, "EZR": 10,
    "NEH": 13, "EST": 10, "JOB": 42, "PSA": 150, "PRO": 31,
    "ECC": 12, "SNG": 8, "ISA": 66, "JER": 52, "LAM": 5,
    "EZK": 48, "DAN": 12, "HOS": 14, "JOL": 3, "AMO": 9,
    "OBA": 1, "JON": 4, "MIC": 7, "NAM": 3, "HAB": 3,
    "ZEP": 3, "HAG": 2, "ZEC": 14, "MAL": 4,
    "MAT": 28, "MRK": 16, "LUK": 24, "JHN": 21, "ACT": 28,
    "ROM": 16, "1CO": 16, "2CO": 13, "GAL": 6, "EPH": 6,
    "PHP": 4, "COL": 4, "1TH": 5, "2TH": 3, "1TI": 6,
    "2TI": 4, "TIT": 3, "PHM": 1, "HEB": 13, "JAS": 5,
    "1PE": 5, "2PE": 3, "1JN": 5, "2JN": 1, "3JN": 1,
    "JUD": 1, "REV": 22,
}


def _fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "bible-import/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def _clean_text(text: str) -> str:
    text = (text or "").replace("\r\n", "\n").strip()
    # 保留 Strong 标记但统一空白
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def _chapter_blocks(*, bid: int, engs: str, chap: int, gb: int = 1) -> list[dict]:
    blocks: list[dict] = []
    seen: set[str] = set()
    sec = 1
    for _ in range(24):
        q = urllib.parse.urlencode({
            "book": FHL_COMMENTARY_BOOK,
            "bid": bid,
            "engs": engs,
            "chap": chap,
            "sec": sec,
            "gb": gb,
        })
        try:
            data = _fetch_json(f"{API}?{q}")
        except (urllib.error.HTTPError, urllib.error.URLError, OSError, json.JSONDecodeError):
            break
        records = data.get("record") or []
        if not records:
            break
        for rec in records:
            title = (rec.get("title") or "").strip()
            text = _clean_text(rec.get("com_text") or "")
            if not title or not text or title in seen:
                continue
            seen.add(title)
            blocks.append({"title": title, "text": text})
        nxt = data.get("next") or {}
        try:
            n_chap = int(nxt.get("chap") or 0)
            n_bid = int(nxt.get("bid") or 0)
            n_sec = int(nxt.get("sec") or 0)
        except (TypeError, ValueError):
            break
        if n_bid != bid or n_chap != chap or n_sec <= sec:
            break
        sec = n_sec
    return blocks


def _count_chapters(path: Path, book: str) -> int:
    if not path.exists():
        return 0
    text = path.read_text(encoding="utf-8", errors="replace")
    return len(re.findall(rf"^# {re.escape(LABEL)} — {re.escape(book)} \d+\s*$", text, re.MULTILINE))


def _count_local_books(out_dir: Path) -> int:
    return len(list(out_dir.glob("fhl-*.md"))) if out_dir.is_dir() else 0


def _network_reachable() -> bool:
    try:
        req = urllib.request.Request(API, headers={"User-Agent": "bible-import/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read(128)
        return True
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError):
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--books", nargs="*", help="OSIS 书卷，默认 66 卷")
    ap.add_argument("--delay", type=float, default=0.15)
    ap.add_argument("--skip-existing", action="store_true")
    ap.add_argument("--gb", type=int, default=1, help="1=简体 0=繁体")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)

    try:
        books = load_fhl_books()
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
        print(f"  ⚠ FHL 书卷表不可达：{exc}", flush=True)
        if args.skip_existing and _count_local_books(OUT) > 0:
            print(f"  · 离线模式：保留已有 {_count_local_books(OUT)} 卷本地文件", flush=True)
            return 0
        return 1

    online = _network_reachable()
    if not online:
        print("  ⚠ FHL API 网络不可达，跳过在线拉取", flush=True)
        if args.skip_existing:
            n = _count_local_books(OUT)
            print(f"  · 离线模式：保留已有 {n} 卷本地文件（书卷表来源：{fhl_books_source()}）", flush=True)
            return 0
        print("  ✗ 无网络时请使用 --skip-existing", flush=True)
        return 1

    fhl = {row[2]: row for row in books}
    targets = [b.upper() for b in args.books] if args.books else sorted(CHAPTER_COUNTS.keys())

    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    meta.update({"id": "fhl-commentary", "title": LABEL, "language": "zh", "rights": "fhl-open-source"})
    status: dict = meta.setdefault("books_status", {})

    ok = skip = 0
    for osis in targets:
        row = fhl.get(osis)
        if not row:
            print(f"  ⚠ 无 FHL 映射：{osis}", flush=True)
            continue
        bid, engs, _, chinese = row
        expected = CHAPTER_COUNTS.get(osis, 1)
        out_file = OUT / f"fhl-{osis.lower()}.md"
        existing = _count_chapters(out_file, osis)
        if args.skip_existing and existing >= expected:
            print(f"  · {osis} 已齐全（{existing}/{expected}），跳过", flush=True)
            skip += 1
            continue

        chunks: list[str] = []
        if existing and out_file.exists():
            chunks = [
                c for c in re.split(r"(?=^# )", out_file.read_text(encoding="utf-8"), flags=re.MULTILINE)
                if c.strip()
            ]
            start = existing + 1
        else:
            start = 1

        fetched = 0
        for chap in range(start, expected + 1):
            blocks = _chapter_blocks(bid=bid, engs=engs, chap=chap, gb=args.gb)
            if not blocks:
                continue
            md_parts = [f"# {LABEL} — {osis} {chap}\n"]
            for blk in blocks:
                md_parts.append(f"## {blk['title']}\n\n{blk['text']}\n")
            chunks.append("\n".join(md_parts))
            out_file.write_text("\n\n".join(chunks), encoding="utf-8")
            fetched += 1
            if chap % 10 == 0:
                print(f"    {chinese} {chap}/{expected}", flush=True)
            time.sleep(args.delay)

        n = _count_chapters(out_file, osis)
        status[osis] = {"chapters": n, "expected": expected}
        print(f"  ✓ {chinese} ({osis}) → {out_file.name} ({n} 章，本次 +{fetched})", flush=True)
        ok += 1

    meta["books_status"] = status
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ FHL 注释：更新 {ok} 卷 / 跳过 {skip} 卷 → {OUT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
