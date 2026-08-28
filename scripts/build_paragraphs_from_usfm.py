#!/usr/bin/env python3
"""从 CNV USFM（\\p 出版段落）+ L1.5 段内 refinement 生成 paragraphs.json。

L0：USFM \\p 外框（绝不跨 \\p 合并）
L1：诗体不切；福音/历史等大段不切；书信 7–12 节 \\p 块段内再切
L2：硬上限 6 节/320 字 + 话语标记软切 + 孤节合并
L3：paragraphs.overrides.json 人工覆盖（纸书标杆章）

用法：
  python scripts/build_paragraphs_from_usfm.py
  python scripts/build_paragraphs_from_usfm.py --zip /path/to/cmn-ncvs_usfm.zip
"""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSES_PATH = ROOT / "data/bible/cnv/verses.json"
OVERRIDES_PATH = ROOT / "data/bible/cnv/paragraphs.overrides.json"
OUT_PATH = ROOT / "data/bible/cnv/paragraphs.json"
CACHE_DIR = ROOT / "data/bible/cnv/.usfm-cache"
USFM_URL = "https://ebible.org/Scriptures/cmn-ncvs_usfm.zip"
USFM_ZIP = CACHE_DIR / "cmn-ncvs_usfm.zip"

_CHAPTER_RE = re.compile(r"\\c (\d+)\b(.*?)(?=\\c \d+\b|\Z)", re.S)
_PARA_SPLIT_RE = re.compile(r"(?=\\p\b|\\b\b)")
_ENDS_SENTENCE_RE = re.compile(r'[。！？；….!?;:]["\'」』)]*$')
_DISCOURSE_RE = re.compile(
    r"^(又|因此|所以|好了|算了|至于|这事|我怕|但是|然而|原来|并且|况且|如今|那时|随后|后来)"
)

POETRY_BOOKS = frozenset(
    {
        "PSA", "PRO", "ECC", "SNG", "LAM", "AMO", "MIC", "HAB", "ZEP", "NAH",
        "HAG", "ZEC", "MAL", "JOB",
    }
)
EPISTLE_BOOKS = frozenset(
    {
        "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI",
        "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN",
        "JUD",
    }
)

MAX_VERSES = 6
MAX_CHARS = 320
EPISTLE_MIN_SPAN = 7
EPISTLE_MAX_SPAN = 12


def download_usfm(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {USFM_URL} …")
    with urllib.request.urlopen(USFM_URL, timeout=120) as resp:
        dest.write_bytes(resp.read())
    print(f"Saved {dest.stat().st_size // 1024} KB")


def ends_sentence(text: str) -> bool:
    return bool(_ENDS_SENTENCE_RE.search(text.strip()))


def char_count(verses: list[dict]) -> int:
    return sum(len(v["text"]) for v in verses)


def merge_singleton_ranges(
    ranges: list[list[int]],
    verse_map: dict[int, dict],
) -> list[list[int]]:
    if len(ranges) <= 1:
        return ranges
    out: list[list[int]] = []
    for start, end in ranges:
        if end - start + 1 > 1 or not out:
            out.append([start, end])
            continue
        prev = out[-1]
        combined = prev[1] - prev[0] + 2
        chars = sum(
            len(verse_map[n]["text"])
            for n in range(prev[0], end + 1)
            if n in verse_map
        )
        if combined <= MAX_VERSES and chars <= MAX_CHARS:
            prev[1] = end
        else:
            out.append([start, end])
    return out


def refine_epistle_block(verses: list[dict]) -> list[list[int]]:
    """书信 medium \\p 块：硬 6 节 + 话语标记软切。"""
    buf: list[dict] = []
    out: list[list[int]] = []

    def flush() -> None:
        nonlocal buf
        if buf:
            out.append([buf[0]["verse"], buf[-1]["verse"]])
            buf = []

    for i, verse in enumerate(verses):
        nxt = verses[i + 1] if i + 1 < len(verses) else None
        if buf:
            if len(buf) >= MAX_VERSES or char_count(buf) >= MAX_CHARS:
                flush()
            elif ends_sentence(buf[-1]["text"]) and nxt and len(buf) >= 2:
                if _DISCOURSE_RE.match(nxt["text"].lstrip()):
                    flush()
        buf.append(verse)
    flush()
    return out


def parse_p_blocks(block: str, expected_verses: set[int]) -> list[tuple[int, int]]:
    """USFM 章内 \\p 块 → (start,end) 列表。"""
    marked_groups: list[set[int]] = []
    for part in _PARA_SPLIT_RE.split(block):
        tagged = {
            int(v) for v in re.findall(r"\\v (\d+)", part) if int(v) in expected_verses
        }
        if tagged:
            marked_groups.append(tagged)

    if not marked_groups:
        verses = sorted(expected_verses)
        return [(verses[0], verses[-1])] if verses else []

    merged: list[set[int]] = []
    for group in marked_groups:
        if not merged:
            merged.append(set(group))
            continue
        prev_max = max(merged[-1])
        cur_min = min(group)
        if cur_min <= prev_max:
            merged[-1].update(group)
        else:
            merged.append(set(group))

    blocks: list[tuple[int, int]] = []
    covered: set[int] = set()
    for group in merged:
        verses = sorted(group)
        covered.update(verses)
        blocks.append((verses[0], verses[-1]))

    for orphan in sorted(expected_verses - covered):
        placed = False
        for start, end in reversed(blocks):
            if orphan >= start:
                blocks[blocks.index((start, end))] = (start, max(end, orphan))
                placed = True
                break
        if not placed and blocks:
            s, e = blocks[-1]
            blocks[-1] = (s, max(e, orphan))

    return blocks


def chapter_paragraphs(
    book: str,
    verses: list[dict],
    p_blocks: list[tuple[int, int]],
) -> list[list[int]]:
    verse_map = {v["verse"]: v for v in verses}
    expected = set(verse_map)
    out: list[list[int]] = []

    for start, end in p_blocks:
        seg = [verse_map[n] for n in range(start, end + 1) if n in verse_map]
        if not seg:
            continue
        span = end - start + 1

        if book in POETRY_BOOKS:
            out.append([start, end])
        elif book in EPISTLE_BOOKS and EPISTLE_MIN_SPAN <= span <= EPISTLE_MAX_SPAN:
            refined = refine_epistle_block(seg)
            out.extend(merge_singleton_ranges(refined, verse_map))
        else:
            out.append([start, end])

    if not out and expected:
        verses_sorted = sorted(expected)
        out.append([verses_sorted[0], verses_sorted[-1]])
    return out


def load_overrides() -> dict[str, list[list[int]]]:
    if not OVERRIDES_PATH.is_file():
        return {}
    raw = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))
    return {str(k).upper(): v for k, v in raw.items()}


def load_expected_chapters() -> dict[tuple[str, int], list[dict]]:
    data = json.loads(VERSES_PATH.read_text(encoding="utf-8"))
    by_ch: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for row in data.get("verses", []):
        by_ch[(row["book"].upper(), int(row["chapter"]))].append(row)
    return by_ch


def validate_coverage(
    chapters: dict[str, list[list[int]]],
    expected: dict[tuple[str, int], list[dict]],
) -> None:
    errors: list[str] = []

    def covered(ranges: list[list[int]], verse: int) -> bool:
        return any(s <= verse <= e for s, e in ranges)

    for (book, ch), verse_rows in sorted(expected.items()):
        key = f"{book}.{ch}"
        ranges = chapters.get(key)
        exp_verses = {v["verse"] for v in verse_rows}
        if not ranges:
            errors.append(f"missing {key}")
            continue
        for v in sorted(exp_verses):
            if not covered(ranges, v):
                errors.append(f"{key} verse {v} not covered")
    if errors:
        raise SystemExit("Validation failed:\n" + "\n".join(errors[:30]))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build paragraphs.json (USFM L1.5)")
    parser.add_argument("--zip", type=Path, help="Local cmn-ncvs_usfm.zip")
    args = parser.parse_args()

    zip_path = args.zip or USFM_ZIP
    if args.zip is None and not zip_path.is_file():
        download_usfm(zip_path)
    if not zip_path.is_file():
        raise SystemExit(f"USFM zip not found: {zip_path}")

    expected = load_expected_chapters()
    overrides = load_overrides()
    chapters: dict[str, list[list[int]]] = {}

    with zipfile.ZipFile(zip_path) as zf:
        for name in sorted(zf.namelist()):
            if not name.endswith(".usfm"):
                continue
            text = zf.read(name).decode("utf-8")
            book_match = re.search(r"\\id (\S+)", text)
            if not book_match:
                continue
            book_id = book_match.group(1).upper()

            for match in _CHAPTER_RE.finditer(text):
                ch = int(match.group(1))
                key = (book_id, ch)
                if key not in expected:
                    continue
                verse_rows = expected[key]
                exp_set = {v["verse"] for v in verse_rows}
                chapter_key = f"{book_id}.{ch}"

                override = overrides.get(chapter_key)
                if override:
                    chapters[chapter_key] = override
                    continue

                blocks = parse_p_blocks(match.group(2), exp_set)
                chapters[chapter_key] = chapter_paragraphs(book_id, verse_rows, blocks)

    validate_coverage(chapters, expected)

    payload = {
        "translation": "cnv",
        "schema": "paragraphs@3",
        "source": "usfm-p+l15",
        "source_url": USFM_URL,
        "chapters": chapters,
    }
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    para_count = sum(len(r) for r in chapters.values())
    print(
        f"Wrote {len(chapters)} chapters / {para_count} paragraphs -> {OUT_PATH} "
        f"({OUT_PATH.stat().st_size // 1024} KB)"
    )


if __name__ == "__main__":
    main()
