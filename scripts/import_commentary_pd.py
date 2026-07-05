#!/usr/bin/env python3
"""公版英文注释 → content/commentary/public-domain/*.md（供 RAG 索引）。

数据源：HelloAO Bible API (public domain)
  https://bible.helloao.org/api/

用法：
  python scripts/import_commentary_pd.py                  # 默认书卷全卷
  python scripts/import_commentary_pd.py --books JHN MAT
  python scripts/import_commentary_pd.py --skip-existing  # 已齐全/上游耗尽则跳过
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
    "adam-clarke": "Adam Clarke Bible Commentary",
    "tyndale": "Tyndale Open Study Notes",
}

# 全 66 卷
ALL_BOOKS = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
    "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
    "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
    "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
    "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
    "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
]

OT_BOOKS = ALL_BOOKS[:39]

# 兼容旧默认：重点书卷快速拉取
DEFAULT_BOOKS = [
    "GEN", "EXO", "PSA", "ISA",
    "MAT", "MRK", "LUK", "JHN", "ACT",
    "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL",
    "HEB", "JAS", "1PE", "1JN", "REV",
]

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


class UpstreamMissing(Exception):
    """上游无该章（404 或返回 HTML 落地页）。"""


def _fetch_json(url: str, *, retries: int = 3) -> dict:
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "bible-import/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode()
            if not raw.lstrip().startswith(("{", "[")):
                raise UpstreamMissing("non-json response")
            return json.loads(raw)
        except UpstreamMissing:
            raise
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise UpstreamMissing("404") from exc
            last_exc = exc
            if attempt < retries:
                time.sleep(0.5 * attempt)
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                time.sleep(0.5 * attempt)
    assert last_exc is not None
    raise last_exc


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


def _count_chapters_in_file(path: Path, book: str) -> int:
    if not path.exists():
        return 0
    text = path.read_text(encoding="utf-8", errors="replace")
    return len(re.findall(rf"^# .+ — {re.escape(book)} \d+\s*$", text, re.MULTILINE))


def _expected_chapters(book: str, max_chapters: int) -> int:
    known = CHAPTER_COUNTS.get(book, 200)
    if max_chapters > 0:
        return min(known, max_chapters)
    return known


def _meta_path(source: str) -> Path:
    return OUT / f"meta-{source}.json"


def _load_meta(source: str) -> dict:
    path = _meta_path(source)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_meta(source: str, meta: dict) -> None:
    _meta_path(source).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _books_for_source(source: str, books: list[str]) -> list[str]:
    if source == "keil-delitzsch":
        return [b for b in books if b in OT_BOOKS]
    return books


def _import_one_source(source: str, args) -> tuple[int, int, int]:
    label = SOURCES.get(source, source)
    books = _books_for_source(source, [b.upper() for b in args.books])

    meta = _load_meta(source)
    meta.update({
        "id": source,
        "title": label,
        "language": "en",
        "source_type": "commentary",
        "rights": "public-domain",
        "api": "https://bible.helloao.org",
        "books": books,
    })
    status: dict = meta.setdefault("books_status", {})

    total_sections = 0
    books_ok = 0
    books_skip = 0

    for book in books:
        book_file = OUT / f"{source}-{book.lower()}.md"
        expected = _expected_chapters(book, args.max_chapters)
        existing_n = _count_chapters_in_file(book_file, book)
        book_st = status.get(book) or {}

        if args.skip_existing and (
            existing_n >= expected or book_st.get("exhausted")
        ):
            books_skip += 1
            continue

        chunks: list[str] = []
        start_ch = 1
        if existing_n > 0 and book_file.exists():
            chunks = [
                c for c in re.split(
                    r"(?=^# )", book_file.read_text(encoding="utf-8"), flags=re.MULTILINE
                )
                if c.strip()
            ]
            start_ch = existing_n + 1

        max_ch = args.max_chapters or expected
        fetched = 0
        exhausted = existing_n >= expected
        consecutive_miss = 0

        for ch in range(start_ch, max_ch + 1):
            url = f"{API}/{source}/{book}/{ch}.json"
            try:
                data = _fetch_json(url)
            except UpstreamMissing:
                consecutive_miss += 1
                if consecutive_miss >= 2:
                    exhausted = True
                    break
                continue
            except Exception as exc:
                print(f"  ⚠ {source} {book} {ch}: {exc}", flush=True)
                break

            consecutive_miss = 0
            md = _chapter_to_md(label, book, ch, data)
            chunks.append(md)
            fetched += 1
            total_sections += max(0, md.count("##"))
            book_file.write_text("\n\n".join(chunks), encoding="utf-8")
            time.sleep(args.delay)
        else:
            exhausted = True

        n = _count_chapters_in_file(book_file, book) if book_file.exists() else 0
        status[book] = {
            "chapters": n,
            "expected": expected,
            "exhausted": exhausted or n >= expected,
        }
        if chunks or n:
            print(f"  ✓ [{source}] {book} ({n} 章，本次 +{fetched})", flush=True)
            books_ok += 1

    meta["books_status"] = status
    _save_meta(source, meta)
    return books_ok, books_skip, total_sections


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="matthew-henry")
    ap.add_argument(
        "--all-sources",
        action="store_true",
        help="导入 HelloAO 全部公版注释源",
    )
    ap.add_argument("--books", nargs="*", default=ALL_BOOKS, help="书卷列表，默认 66 卷")
    ap.add_argument("--max-chapters", type=int, default=0, help="每卷最多章数，0=全卷")
    ap.add_argument("--delay", type=float, default=0.12)
    ap.add_argument(
        "--skip-existing",
        action="store_true",
        help="已齐全或上游耗尽的书卷跳过（发版幂等）",
    )
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    sources = list(SOURCES.keys()) if args.all_sources else [args.source]
    if args.all_sources:
        print(f"HelloAO 公版注释：{len(sources)} 源 × {len(args.books)} 卷", flush=True)

    total_ok = total_skip = total_sections = 0
    for source in sources:
        if len(sources) > 1:
            print(f"── {source} ──", flush=True)
        ok, skip, sections = _import_one_source(source, args)
        total_ok += ok
        total_skip += skip
        total_sections += sections

    print(
        f"✓ HelloAO 公版注释：更新 {total_ok} 卷次 / 跳过 {total_skip} 卷次 / "
        f"新增约 {total_sections} 段 → {OUT}",
        flush=True,
    )
    print("  下一步：make ensure-rag", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
