"""列表/宣告体段落：逐节拆分与 catalog 应用（build_paragraphs_from_usfm L4）。"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DISCOURSE_PATH = ROOT / "data/bible/cnv/discourse_line_ranges.json"
CUVS_VERSES_PATH = ROOT / "data/bible/cuvs/verses.json"

POETRY_BOOKS = frozenset(
    {
        "PSA", "PRO", "ECC", "SNG", "LAM", "AMO", "MIC", "HAB", "ZEP", "NAH",
        "HAG", "ZEC", "MAL", "JOB",
    }
)
PROPHET_BOOKS = frozenset(
    {
        "ISA", "JER", "EZK", "DAN", "HOS", "JOL", "AMO", "OBAD", "JON", "MIC",
        "NAH", "HAB", "ZEP", "HAG", "ZEC", "MAL",
    }
)

_PATTERNS = {
    "beatitude": re.compile(r".*的人有福了[！!]"),
    "woe_pharisee": re.compile(r"(文士和法利赛人|法利赛人|律法师|瞎眼领路的)有祸"),
    "woe_luk6": re.compile(r"你们(富足|饱足|喜笑)的人有祸"),
    "woe_prophet": re.compile(r"^祸哉[！!，,]"),
    "love_is": re.compile(r"^爱是"),
    "lord_prayer": re.compile(r"^(我们在天上的父|愿人都尊|愿你的国|愿你的旨意|我们日用的|免我们的|不叫我们)"),
}


def split_paragraph_ranges(
    ranges: list[list[int]],
    split_start: int,
    split_end: int,
) -> list[list[int]]:
    """将重叠 [split_start, split_end] 的段落块拆成 [n,n]。"""
    out: list[list[int]] = []
    for start, end in ranges:
        if end < split_start or start > split_end:
            out.append([start, end])
            continue
        if start < split_start:
            out.append([start, split_start - 1])
        lo = max(start, split_start)
        hi = min(end, split_end)
        for n in range(lo, hi + 1):
            out.append([n, n])
        if end > split_end:
            out.append([split_end + 1, end])
    return out


def apply_discourse_entries(
    ranges: list[list[int]],
    entries: list[dict[str, Any]],
) -> list[list[int]]:
    result = [list(r) for r in ranges]
    for entry in entries:
        if entry.get("mode") != "verse_per_line":
            continue
        for split_start, split_end in entry.get("ranges", []):
            result = split_paragraph_ranges(result, int(split_start), int(split_end))
    return result


def load_discourse_catalog(path: Path | None = None) -> dict[str, list[dict[str, Any]]]:
    p = path or DISCOURSE_PATH
    if not p.is_file():
        return {}
    raw = json.loads(p.read_text(encoding="utf-8"))
    by_ch: dict[str, list[dict[str, Any]]] = {}
    for entry in raw.get("entries", []):
        ref = str(entry.get("ref", "")).upper()
        if not ref:
            continue
        by_ch.setdefault(ref, []).append(entry)
    return by_ch


def discourse_entries_for_chapter(
    catalog: dict[str, list[dict[str, Any]]],
    chapter_key: str,
) -> list[dict[str, Any]]:
    return catalog.get(chapter_key.upper(), [])


def _contiguous_ranges(verses: list[int]) -> list[list[int]]:
    if not verses:
        return []
    verses = sorted(verses)
    out: list[list[int]] = []
    start = end = verses[0]
    for v in verses[1:]:
        if v == end + 1:
            end = v
        else:
            out.append([start, end])
            start = end = v
    out.append([start, end])
    return out


def _load_verse_text() -> dict[tuple[str, int, int], str]:
    data = json.loads(CUVS_VERSES_PATH.read_text(encoding="utf-8"))
    return {
        (r["book"].upper(), int(r["chapter"]), int(r["verse"])): r["text"]
        for r in data.get("verses", [])
    }


def _manual_entries() -> list[dict[str, Any]]:
    """人工标杆：P0–P2 核心章。"""
    return [
        {"ref": "MAT.5", "ranges": [[3, 12]], "mode": "verse_per_line", "kind": "beatitude"},
        {"ref": "MAT.6", "ranges": [[9, 13]], "mode": "verse_per_line", "kind": "lord_prayer"},
        {"ref": "MAT.23", "ranges": [[13, 29]], "mode": "verse_per_line", "kind": "woe_pharisee"},
        {"ref": "LUK.6", "ranges": [[20, 26]], "mode": "verse_per_line", "kind": "beatitude_woe"},
        {"ref": "LUK.11", "ranges": [[2, 4]], "mode": "verse_per_line", "kind": "lord_prayer"},
        {
            "ref": "LUK.11",
            "ranges": [[42, 44], [46, 47], [52, 52]],
            "mode": "verse_per_line",
            "kind": "woe_pharisee",
        },
        {"ref": "EXO.20", "ranges": [[3, 17]], "mode": "verse_per_line", "kind": "commandments"},
        {"ref": "DEU.5", "ranges": [[7, 21]], "mode": "verse_per_line", "kind": "commandments"},
        {"ref": "ROM.12", "ranges": [[9, 21]], "mode": "verse_per_line", "kind": "virtue_list"},
        {"ref": "1CO.13", "ranges": [[4, 8]], "mode": "verse_per_line", "kind": "love_is"},
        {"ref": "GAL.5", "ranges": [[22, 23]], "mode": "verse_per_line", "kind": "fruit_spirit"},
        {"ref": "EPH.6", "ranges": [[14, 17]], "mode": "verse_per_line", "kind": "armor"},
        {"ref": "JAS.3", "ranges": [[17, 18]], "mode": "verse_per_line", "kind": "wisdom"},
        {"ref": "MAT.1", "ranges": [[1, 17]], "mode": "semicolon_break", "kind": "genealogy"},
        {"ref": "LUK.3", "ranges": [[23, 38]], "mode": "semicolon_break", "kind": "genealogy"},
        {"ref": "GEN.5", "ranges": [[1, 32]], "mode": "semicolon_break", "kind": "genealogy"},
        {"ref": "GEN.10", "ranges": [[1, 32]], "mode": "semicolon_break", "kind": "genealogy"},
        {"ref": "GEN.11", "ranges": [[10, 32]], "mode": "semicolon_break", "kind": "genealogy"},
        {"ref": "1CH.1", "ranges": [[1, 54]], "mode": "semicolon_break", "kind": "genealogy"},
        {"ref": "NEH.7", "ranges": [[6, 73]], "mode": "semicolon_break", "kind": "genealogy"},
        {"ref": "NEH.12", "ranges": [[10, 26]], "mode": "semicolon_break", "kind": "genealogy"},
        {"ref": "MAT.5", "ranges": [[21, 48]], "mode": "verse_per_line", "kind": "antithesis"},
        {
            "ref": "REV.2",
            "ranges": [[2, 6], [9, 10], [13, 16], [19, 28]],
            "mode": "verse_per_line",
            "kind": "rev_letter",
        },
        {
            "ref": "REV.3",
            "ranges": [[2, 5], [8, 12], [15, 21]],
            "mode": "verse_per_line",
            "kind": "rev_letter",
        },
    ]


def _p3_prophet_entries(verse_text: dict[tuple[str, int, int], str]) -> list[dict[str, Any]]:
    """P3：先知书祸哉等长尾。"""
    out: list[dict[str, Any]] = []
    # 以赛亚 5 章祸哉段（8–25 整段逐节）
    out.append(
        {"ref": "ISA.5", "ranges": [[8, 25]], "mode": "verse_per_line", "kind": "woe_prophet"},
    )
    out.append(
        {"ref": "EZK.24", "ranges": [[6, 9]], "mode": "verse_per_line", "kind": "woe_prophet"},
    )
    by_ch: dict[str, list[int]] = {}
    for (book, ch, v), text in verse_text.items():
        if book not in PROPHET_BOOKS or book in POETRY_BOOKS:
            continue
        if book == "ISA" and ch == 5:
            continue
        t = text.strip()
        if _PATTERNS["woe_prophet"].search(t) or (
            "祸哉" in t[:24] and book in PROPHET_BOOKS
        ):
            by_ch.setdefault(f"{book}.{ch}", []).append(v)
    for ref, verses in sorted(by_ch.items()):
        if len(verses) < 2:
            continue
        for r in _contiguous_ranges(verses):
            if r[1] - r[0] >= 1 or len(verses) >= 3:
                out.append(
                    {
                        "ref": ref,
                        "ranges": [r],
                        "mode": "verse_per_line",
                        "kind": "woe_prophet",
                    },
                )
    return out


def _auto_scan_entries(verse_text: dict[tuple[str, int, int], str]) -> list[dict[str, Any]]:
    """模式扫描：八福、法利赛祸等（跳过已在 manual 中的 ref+kind）。"""
    out: list[dict[str, Any]] = []
    chapters: dict[str, list[tuple[int, str, str]]] = {}
    for (book, ch, v), text in verse_text.items():
        if book in POETRY_BOOKS:
            continue
        key = f"{book}.{ch}"
        for kind, pat in _PATTERNS.items():
            if kind == "woe_prophet":
                continue
            if pat.search(text.strip()):
                chapters.setdefault(key, []).append((v, kind, text[:20]))
    for ref, hits in sorted(chapters.items()):
        by_kind: dict[str, list[int]] = {}
        for v, kind, _ in hits:
            by_kind.setdefault(kind, []).append(v)
        for kind, verses in by_kind.items():
            if kind == "beatitude" and len(verses) < 2:
                continue
            if kind == "woe_pharisee" and len(verses) < 3:
                continue
            if kind == "love_is" and len(verses) < 3:
                continue
            if len(verses) < 2:
                continue
            for r in _contiguous_ranges(verses):
                out.append(
                    {
                        "ref": ref,
                        "ranges": [r],
                        "mode": "verse_per_line",
                        "kind": kind,
                    },
                )
    return out


def _dedupe_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """manual 优先；同 ref+range+mode 去重。"""
    seen: set[tuple[str, tuple[tuple[int, int], ...], str]] = set()
    out: list[dict[str, Any]] = []
    for entry in entries:
        ref = str(entry["ref"]).upper()
        mode = str(entry.get("mode", "verse_per_line"))
        ranges = tuple(tuple(r) for r in entry.get("ranges", []))
        key = (ref, ranges, mode)
        if key in seen:
            continue
        seen.add(key)
        out.append({**entry, "ref": ref})
    return out


def build_discourse_catalog() -> dict[str, Any]:
    verse_text = _load_verse_text()
    manual = _manual_entries()
    manual_ref_kind = {(e["ref"], e.get("kind")) for e in manual}
    manual_ref_only = {e["ref"] for e in manual}
    entries = list(manual)
    entries.extend(_p3_prophet_entries(verse_text))
    for e in _auto_scan_entries(verse_text):
        if (e["ref"], e.get("kind")) in manual_ref_kind:
            continue
        # 已有整段覆盖（如 LUK.6 beatitude_woe）时跳过碎片 auto 条目
        if e["ref"] in manual_ref_only and e.get("kind") in {
            "beatitude", "woe_luk6", "woe_pharisee", "lord_prayer", "beatitude_woe",
        }:
            continue
        entries.append(e)
    return {"schema": "discourse_line@1", "entries": _dedupe_entries(entries)}


def write_discourse_catalog(path: Path | None = None) -> Path:
    p = path or DISCOURSE_PATH
    catalog = build_discourse_catalog()
    p.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return p
