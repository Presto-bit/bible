#!/usr/bin/env python3
"""从 CUVS 诗体卷经文生成 poetry_lines.json（平行行/阶梯体，§7.3）。

启发式：「。」后分句、「；」分段、「， 」后平行行（诗体卷专用）。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSES_PATH = ROOT / "data/bible/cuvs/verses.json"
OUT_PATH = ROOT / "data/bible/cnv/poetry_lines.json"

POETRY_BOOKS = frozenset(
    {
        "PSA", "PRO", "ECC", "SNG", "LAM", "AMO", "MIC", "HAB", "ZEP", "NAH",
        "HAG", "ZEC", "MAL", "JOB",
    }
)

_COMMA_SPACE = re.compile(r"(?<=，)\s+")


def _split_semicolons(text: str) -> list[str]:
    if "；" not in text:
        return [text]
    parts = text.split("；")
    out: list[str] = []
    for i, part in enumerate(parts):
        chunk = part.strip()
        if not chunk:
            continue
        out.append(chunk + "；" if i < len(parts) - 1 else chunk)
    return out


def _split_poetry_verse(text: str) -> list[str] | None:
    t = text.strip()
    if not t:
        return None

    segments: list[str] = []
    for block in re.split(r"\。\s+", t):
        block = block.strip()
        if not block:
            continue
        if not block.endswith("。") and "。" in t:
            block = block + "。"
        if "；" in block:
            segments.extend(_split_semicolons(block))
        elif _COMMA_SPACE.search(block):
            segments.extend(s.strip() for s in _COMMA_SPACE.split(block) if s.strip())
        else:
            segments.append(block)

    segments = [s for s in segments if s]
    if len(segments) < 2:
        return None
    return segments


def build_poetry_lines() -> dict:
    data = json.loads(VERSES_PATH.read_text(encoding="utf-8"))
    verses: dict[str, list[str]] = {}
    for row in data.get("verses", []):
        book = row["book"].upper()
        if book not in POETRY_BOOKS:
            continue
        ch = int(row["chapter"])
        v = int(row["verse"])
        lines = _split_poetry_verse(row["text"])
        if lines:
            verses[f"{book}.{ch}.{v}"] = lines

    return {"schema": "poetry_lines@1", "verses": verses}


def main() -> None:
    payload = build_poetry_lines()
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(payload['verses'])} verses -> {OUT_PATH} ({OUT_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
