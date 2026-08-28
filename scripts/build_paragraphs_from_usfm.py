#!/usr/bin/env python3
"""从 CNV USFM（\\p 出版段落）生成 data/bible/cnv/paragraphs.json。

数据源：eBible.org cmn-ncvs USFM（与仓库 verses.json 节文一致，仅提取节号边界）。
USFM 压缩包不入库（版权），脚本按需下载到 data/bible/cnv/.usfm-cache/。

用法：
  python scripts/build_paragraphs_from_usfm.py
  python scripts/build_paragraphs_from_usfm.py --zip /path/to/cmn-ncvs_usfm.zip
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSES_PATH = ROOT / "data/bible/cnv/verses.json"
OUT_PATH = ROOT / "data/bible/cnv/paragraphs.json"
CACHE_DIR = ROOT / "data/bible/cnv/.usfm-cache"
USFM_URL = "https://ebible.org/Scriptures/cmn-ncvs_usfm.zip"
USFM_ZIP = CACHE_DIR / "cmn-ncvs_usfm.zip"

_CHAPTER_RE = re.compile(r"\\c (\d+)\b(.*?)(?=\\c \d+\b|\Z)", re.S)
_PARA_SPLIT_RE = re.compile(r"(?=\\p\b|\\b\b)")


def download_usfm(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {USFM_URL} …")
    with urllib.request.urlopen(USFM_URL, timeout=120) as resp:
        dest.write_bytes(resp.read())
    print(f"Saved {dest.stat().st_size // 1024} KB")


def parse_chapter_paragraphs(
    block: str,
    expected_verses: set[int],
) -> list[list[int]]:
    """按 USFM \\p 切分；只保留本章真实节号，缺 \\v 的节并入上一段。"""
    parts = _PARA_SPLIT_RE.split(block)
    marked_groups: list[set[int]] = []
    for part in parts:
        tagged = {int(v) for v in re.findall(r"\\v (\d+)", part) if int(v) in expected_verses}
        if tagged:
            marked_groups.append(tagged)

    if not marked_groups:
        verses = sorted(v for v in expected_verses)
        return [[verses[0], verses[-1]]] if verses else []

    # 合并相邻 \\p 块（USFM 有时在 \\s1 后再开 \\p，仍属同一段）
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

    assigned: set[int] = set()
    paras: list[list[int]] = []
    for group in merged:
        verses = sorted(group)
        assigned.update(verses)
        paras.append([verses[0], verses[-1]])

    orphans = sorted(expected_verses - assigned)
    for v in orphans:
        placed = False
        for para in reversed(paras):
            if para[0] <= v <= para[1] + 3 or v > para[1]:
                # 紧接上一段末尾的无 \\v 节（如 1CH 21:31）
                if v >= para[0]:
                    para[1] = max(para[1], v)
                    assigned.add(v)
                    placed = True
                    break
        if not placed and paras:
            paras[-1][1] = max(paras[-1][1], v)
            assigned.add(v)

    return paras


def parse_usfm_book(text: str, expected: dict[tuple[str, int], set[int]]) -> dict[int, list[list[int]]]:
    book_match = re.search(r"\\id (\S+)", text)
    book_id = book_match.group(1).upper() if book_match else ""
    out: dict[int, list[list[int]]] = {}
    for match in _CHAPTER_RE.finditer(text):
        ch = int(match.group(1))
        exp = expected.get((book_id, ch), set())
        if not exp:
            continue
        out[ch] = parse_chapter_paragraphs(match.group(2), exp)
    return out


def load_expected_chapters() -> dict[tuple[str, int], set[int]]:
    data = json.loads(VERSES_PATH.read_text(encoding="utf-8"))
    expected: dict[tuple[str, int], set[int]] = defaultdict(set)
    for row in data.get("verses", []):
        expected[(row["book"].upper(), int(row["chapter"]))].add(int(row["verse"]))
    return expected


def validate_coverage(
    chapters: dict[str, list[list[int]]],
    expected: dict[tuple[str, int], set[int]],
) -> None:
    errors: list[str] = []

    def covered_by_ranges(ranges: list[list[int]], verse: int) -> bool:
        return any(start <= verse <= end for start, end in ranges)

    for (book, ch), verse_set in sorted(expected.items()):
        key = f"{book}.{ch}"
        ranges = chapters.get(key)
        if not ranges:
            errors.append(f"missing {key}")
            continue
        for v in sorted(verse_set):
            if not covered_by_ranges(ranges, v):
                errors.append(f"{key} verse {v} not in any paragraph")
    if errors:
        raise SystemExit("Validation failed:\n" + "\n".join(errors[:30]))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build paragraphs.json from CNV USFM")
    parser.add_argument("--zip", type=Path, help="Local cmn-ncvs_usfm.zip (skip download)")
    args = parser.parse_args()

    zip_path = args.zip or USFM_ZIP
    if args.zip is None and not zip_path.is_file():
        download_usfm(zip_path)
    if not zip_path.is_file():
        raise SystemExit(f"USFM zip not found: {zip_path}")

    expected = load_expected_chapters()
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
            for ch, ranges in parse_usfm_book(text, expected).items():
                key = f"{book_id}.{ch}"
                if ranges:
                    chapters[key] = ranges

    validate_coverage(chapters, expected)

    payload = {
        "translation": "cnv",
        "schema": "paragraphs@2",
        "source": "usfm-p",
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
