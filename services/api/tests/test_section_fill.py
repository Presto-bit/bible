"""section_fill 单测（P2 单次补形 · OIA）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.section_fill import (  # noqa: E402
    collect_section_fill_hints,
    needs_section_fill,
)


def test_collect_hints_missing_oia_sections():
    body = "### 摘要\n只有摘要。"
    hints = collect_section_fill_hints(
        body,
        "verse_full",
        verse_span=1,
        depth="oia_compact",
        planned_sections=("摘要", "经文背景", "经文解释", "今日回应"),
    )
    joined = " ".join(hints)
    assert "经文背景" in joined or "经文解释" in joined


def test_needs_section_fill_prose():
    body = (
        "### 摘要\n摘要。\n\n"
        "### 经文解释\n"
        + ("这是一大段没有任何列表的散文解释。" * 6)
    )
    assert needs_section_fill(body, "verse_full", depth="oia_deep")


def test_no_fill_when_oia_complete():
    body = (
        "### 摘要\n摘要。\n\n"
        "### 经文解释\n当时指重生。\n\n"
        "### 经文背景\n与整卷主题相连。\n\n"
        "### 今日回应\n今天可以祷告回应。"
    )
    hints = collect_section_fill_hints(
        body,
        "verse_quick",
        verse_span=1,
        depth="oia_compact",
        planned_sections=("摘要", "经文背景", "经文解释", "今日回应"),
    )
    assert hints == []


def test_oia_standard_skips_thickness_fill():
    body = (
        "### 摘要\n短摘要。\n\n"
        "### 经文解释\n- 一句解释。\n\n"
        "### 经文背景\n- 一句关联。\n\n"
        "### 今日回应\n- 一句回应。"
    )
    assert not needs_section_fill(
        body,
        "verse_full",
        depth="oia_standard",
        planned_sections=("摘要", "经文背景", "经文解释", "今日回应"),
        min_complete=180,
    )


def test_oia_compact_fills_truncation():
    body = "### 摘要\n说到一半就被"
    hints = collect_section_fill_hints(body, "verse_full", depth="oia_compact")
    assert any("截断" in h for h in hints)


def test_study_fills_thin_summary():
    body = "### 本章概览\n只有一句。"
    hints = collect_section_fill_hints(body, "summary_chapter", depth="study")
    assert hints
