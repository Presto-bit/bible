#!/usr/bin/env python3
"""从 CNV 经文 + sections 生成阅读段落表（L2 兜底）。

出版段落请优先使用 USFM \\p：
  python scripts/build_paragraphs_from_usfm.py

本脚本仅在无 USFM 时作算法近似。
- 强断点：sections.json 小标题节
- 散文：段内 2–6 节 / ≤320 字；弱断点仅当 ≥3 节且 ≥120 字且上一节句末
- 诗体卷：逐节
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSES_PATH = ROOT / "data/bible/cnv/verses.json"
SECTIONS_PATH = ROOT / "data/bible/cnv/sections.json"
OUT_PATH = ROOT / "data/bible/cnv/paragraphs.json"

POETRY_BOOKS = frozenset(
    {
        "PSA",
        "PRO",
        "ECC",
        "SNG",
        "LAM",
        "AMO",
        "MIC",
        "HAB",
        "ZEP",
        "NAH",
        "HAG",
        "ZEC",
        "MAL",
        "JOB",
    }
)

MIN_VERSES = 2
MAX_VERSES = 6
MAX_CHARS = 320
MIN_WEAK_VERSES = 3
MIN_WEAK_CHARS = 120

ENDS_SENTENCE_RE = re.compile(r'[。！？；….!?;:]["\'」』)]*$')


def ends_sentence(text: str) -> bool:
    return bool(ENDS_SENTENCE_RE.search(text.strip()))


def group_segment(verses: list[dict]) -> list[list[int]]:
    """将同一 pericope 内经节合并为 [start, end] 列表。"""
    if not verses:
        return []
    ranges: list[list[int]] = []
    buf: list[dict] = []

    def char_count(b: list[dict]) -> int:
        return sum(len(v["text"]) for v in b)

    def flush() -> None:
        nonlocal buf
        if not buf:
            return
        ranges.append([buf[0]["verse"], buf[-1]["verse"]])
        buf = []

    for v in verses:
        if buf:
            if len(buf) >= MAX_VERSES or char_count(buf) >= MAX_CHARS:
                flush()
            elif (
                len(buf) >= MIN_WEAK_VERSES
                and char_count(buf) >= MIN_WEAK_CHARS
                and ends_sentence(buf[-1]["text"])
            ):
                flush()
        buf.append(v)
    flush()
    return merge_singleton_ranges(ranges, verses)


def merge_singleton_ranges(ranges: list[list[int]], verses: list[dict]) -> list[list[int]]:
    """合并段内孤节到上一段（在上限内）。"""
    if len(ranges) <= 1:
        return ranges
    verse_map = {v["verse"]: v for v in verses}
    out: list[list[int]] = []
    for start, end in ranges:
        if end - start + 1 > 1 or not out:
            out.append([start, end])
            continue
        prev = out[-1]
        combined = prev[1] - prev[0] + 1 + 1
        texts = [
            verse_map[n]["text"]
            for n in range(prev[0], end + 1)
            if n in verse_map
        ]
        if combined <= MAX_VERSES and sum(len(t) for t in texts) <= MAX_CHARS:
            prev[1] = end
        else:
            out.append([start, end])
    return out


def segment_starts(section_starts: list[int], first: int, last: int) -> list[int]:
    starts = sorted({s for s in section_starts if first <= s <= last})
    if not starts or starts[0] != first:
        starts = [first] + [s for s in starts if s != first]
    return starts


def group_chapter(book: str, verses: list[dict], section_starts: list[int]) -> list[list[int]]:
    if not verses:
        return []
    if book.upper() in POETRY_BOOKS:
        return [[v["verse"], v["verse"]] for v in verses]

    verses = sorted(verses, key=lambda v: v["verse"])
    first, last = verses[0]["verse"], verses[-1]["verse"]
    starts = segment_starts(section_starts, first, last)

    out: list[list[int]] = []
    for i, seg_start in enumerate(starts):
        seg_end = (starts[i + 1] - 1) if i + 1 < len(starts) else last
        seg_verses = [v for v in verses if seg_start <= v["verse"] <= seg_end]
        out.extend(group_segment(seg_verses))
    return out


def main() -> None:
    verses_data = json.loads(VERSES_PATH.read_text(encoding="utf-8"))
    sections_data = json.loads(SECTIONS_PATH.read_text(encoding="utf-8"))
    sections_index = sections_data.get("chapters", {})

    by_chapter: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for v in verses_data.get("verses", []):
        by_chapter[(v["book"].upper(), int(v["chapter"]))].append(v)

    chapters: dict[str, list[list[int]]] = {}
    for (book, chapter), verses in sorted(by_chapter.items()):
        key = f"{book}.{chapter}"
        sec = [m["verse"] for m in sections_index.get(key, [])]
        ranges = group_chapter(book, verses, sec)
        if ranges:
            chapters[key] = ranges

    payload = {
        "translation": "cnv",
        "schema": "paragraphs@1",
        "chapters": chapters,
    }
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(chapters)} chapters -> {OUT_PATH} ({OUT_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
