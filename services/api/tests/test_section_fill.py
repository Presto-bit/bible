"""section_fill 单测（P2 单次补形）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.section_fill import (  # noqa: E402
    collect_section_fill_hints,
    needs_section_fill,
)


def test_collect_hints_missing_verse_sections():
    body = "### 摘要\n只有摘要。"
    hints = collect_section_fill_hints(body, "verse_full", verse_span=11)
    assert any("经文背景" in h for h in hints)
    assert any("段落脉络" in h for h in hints)


def test_needs_section_fill_prose():
    body = (
        "### 摘要\n摘要。\n\n"
        "### 经文解释\n"
        + ("这是一大段没有任何列表的散文解释。" * 6)
    )
    assert needs_section_fill(body, "verse_full", depth="deep")
    complete = (
        "### 摘要\n这是足够长的摘要句，概括经文核心。\n\n"
        "### 经文背景\n- 背景要点一，补充上下文。\n\n"
        "### 经文解释\n"
        "- 解释一，说明关键字含义。\n"
        "- 解释二，联系上下文。\n"
        "- 解释三，自然收束。"
    )
    assert not needs_section_fill(
        complete,
        "verse_full",
        depth="standard",
        planned_sections=("摘要", "经文背景", "经文解释"),
        min_complete=60,
    )


def test_no_fill_when_complete():
    body = (
        "### 摘要\n摘要。\n\n"
        "### 经文背景\n- 背景一。\n\n"
        "### 经文解释\n- 解释一。\n- 解释二。\n- 解释三。\n"
    )
    hints = collect_section_fill_hints(body, "verse_quick", verse_span=1)
    assert hints == []


def test_standard_skips_thickness_fill():
    """standard 仅补缺失 intent，不因偏薄触发加厚。"""
    body = (
        "### 摘要\n短摘要。\n\n"
        "### 经文背景\n- 一句背景。\n\n"
        "### 经文解释\n- 一句解释。"
    )
    assert not needs_section_fill(
        body,
        "verse_full",
        depth="standard",
        planned_sections=("摘要", "经文背景", "经文解释"),
        min_complete=60,
    )


def test_standard_fills_truncation():
    body = "### 摘要\n说到一半就被"
    hints = collect_section_fill_hints(body, "verse_full", depth="standard")
    assert any("截断" in h for h in hints)


def test_study_fills_thin_summary():
    body = "### 本章概览\n只有一句。"
    hints = collect_section_fill_hints(body, "summary_chapter", depth="study")
    assert hints
