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
        "### 摘要\n这节经文指出，信靠基督的人已归入他的名下。\n\n"
        "### 经文背景\n"
        "保罗在此回应罗马教会关于律法与恩典的争论，并承接前五章因信称义的教导。\n\n"
        "### 经文解释\n"
        "承接上文因信称义，「向罪死」指不再让罪作主；「向神活」指把自己交给神更新行事。\n"
        "当初读者是罗马教会中的犹太与外邦信徒，作者意在说明称义后当活出新生命。\n\n"
        "### 今日回应\n"
        "今天可以先承认哪些旧习惯仍在拉扯，并求圣灵给你具体一步顺服的行动。"
    )
    hints = collect_section_fill_hints(
        body,
        "verse_quick",
        verse_span=1,
        depth="oia_compact",
        planned_sections=("摘要", "经文背景", "经文解释", "今日回应"),
    )
    assert hints == []


def test_oia_standard_fills_missing_explain_dimensions():
    body = (
        "### 摘要\n短摘要。\n\n"
        "### 经文解释\n- 一句解释。\n\n"
        "### 经文背景\n- 一句关联。\n\n"
        "### 今日回应\n- 一句回应。"
    )
    hints = collect_section_fill_hints(
        body,
        "verse_full",
        depth="oia_standard",
        planned_sections=("摘要", "经文背景", "经文解释", "今日回应"),
        min_complete=180,
    )
    assert any("经文解释" in h for h in hints)


def test_oia_compact_fills_truncation():
    body = "### 摘要\n说到一半就被"
    hints = collect_section_fill_hints(body, "verse_full", depth="oia_compact")
    assert any("截断" in h for h in hints)


def test_study_fills_thin_summary():
    body = "### 本章概览\n只有一句。"
    hints = collect_section_fill_hints(body, "summary_chapter", depth="study")
    assert hints
