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
}

# 扩卷：律法 / 诗篇 / 福音 / 使徒行传 / 保罗书信核心 / 希伯来书
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


def _load_meta() -> dict:
    path = OUT / "meta.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_meta(meta: dict) -> None:
    (OUT / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="matthew-henry")
    ap.add_argument("--books", nargs="*", default=DEFAULT_BOOKS)
    ap.add_argument("--max-chapters", type=int, default=0, help="每卷最多章数，0=全卷")
    ap.add_argument("--delay", type=float, default=0.12)
    ap.add_argument(
        "--skip-existing",
        action="store_true",
        help="已齐全或上游耗尽的书卷跳过（发版幂等）",
    )
    args = ap.parse_args()

    source = args.source
    label = SOURCES.get(source, source)
    OUT.mkdir(parents=True, exist_ok=True)

    meta = _load_meta()
    meta.update({
        "id": source,
        "title": label,
        "language": "en",
        "source_type": "commentary",
        "rights": "public-domain",
        "api": "https://bible.helloao.org",
        "books": [b.upper() for b in args.books],
    })
    status: dict = meta.setdefault("books_status", {})

    total_sections = 0
    books_ok = 0
    books_skip = 0

    for book in args.books:
        book = book.upper()
        book_file = OUT / f"{source}-{book.lower()}.md"
        expected = _expected_chapters(book, args.max_chapters)
        existing_n = _count_chapters_in_file(book_file, book)
        book_st = status.get(book) or {}

        if args.skip_existing and (
            existing_n >= expected or book_st.get("exhausted")
        ):
            reason = "齐全" if existing_n >= expected else "上游已耗尽"
            print(f"  · {book} 已{reason}（{existing_n}/{expected} 章），跳过", flush=True)
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
            if start_ch <= expected:
                print(f"  … {book} 续拉自第 {start_ch} 章（已有 {existing_n}）", flush=True)

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
                # 连续 2 章上游无数据 → 视为该卷在源站已结束
                if consecutive_miss >= 2:
                    exhausted = True
                    print(
                        f"  · {book} 上游自第 {ch - 1} 章起无数据，记为耗尽",
                        flush=True,
                    )
                    break
                continue
            except Exception as exc:
                print(f"  ⚠ {book} {ch}: {exc}", flush=True)
                # 瞬时错误：保留已拉内容，不标记 exhausted，下次续拉
                break

            consecutive_miss = 0
            md = _chapter_to_md(label, book, ch, data)
            chunks.append(md)
            fetched += 1
            total_sections += max(0, md.count("##"))
            book_file.write_text("\n\n".join(chunks), encoding="utf-8")
            if ch % 10 == 0 or ch == max_ch:
                print(f"    {book} {ch}/{max_ch}", flush=True)
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
            print(f"  ✓ {book} → {book_file.name} ({n} 章，本次 +{fetched})", flush=True)
            books_ok += 1
        else:
            print(f"  ⚠ {book} 无内容", flush=True)

    meta["books_status"] = status
    _save_meta(meta)

    print(
        f"✓ 公版注释：更新 {books_ok} 卷 / 跳过 {books_skip} 卷 / "
        f"新增约 {total_sections} 段 → {OUT}",
        flush=True,
    )
    print("  下一步：make rag-index-pd 或 bash scripts/ensure_rag.sh", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
