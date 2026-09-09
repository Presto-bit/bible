"""depth_router 单测（R1）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.depth_router import resolve_depth  # noqa: E402
from app.ai.output_plan import build_output_plan  # noqa: E402


def test_half_sheet_single_verse_flash():
    prof = resolve_depth(
        "verse_full",
        "请解读：约 3:16",
        verse_span=1,
        surface="half_sheet",
    )
    assert prof.depth == "flash"
    assert prof.sections == ("摘要",)
    assert prof.section_policy == "lead_only"
    plan = build_output_plan(
        "verse_full",
        question="请解读：约 3:16",
        verse_span=1,
        surface="half_sheet",
        depth=prof,
    )
    assert plan["depth"] == "flash"
    assert plan["sections"] == ["摘要"]
    assert plan["max_followups"] == 0


def test_half_sheet_passage_without_deep_question_soft():
    prof = resolve_depth(
        "verse_full",
        None,
        verse_span=11,
        surface="half_sheet",
    )
    assert prof.depth == "standard"
    assert "段落脉络" not in prof.sections


def test_deep_question_expands_sections():
    prof = resolve_depth(
        "verse_full",
        "请分别说说背景和经文解释",
        verse_span=11,
        surface="half_sheet",
    )
    assert prof.depth == "deep"
    assert prof.sections == ("摘要", "经文背景", "段落脉络", "经文解释")


def test_study_scene():
    prof = resolve_depth("chat_study", "帮我预备查经", surface="assistant")
    assert prof.depth == "study"
    assert "讨论问题" in prof.sections or "结构大纲" in prof.sections
