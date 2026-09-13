"""output_plan 单测（P1 meta 骨架契约 · OIA）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.output_plan import build_output_plan, planned_section_titles  # noqa: E402
from app.ai.depth_router import resolve_depth  # noqa: E402


def test_tab_deep_passage_plan():
    depth = resolve_depth(
        "verse_full",
        "请分别说说背景和脉络",
        verse_span=11,
        surface="assistant",
    )
    sections = planned_section_titles(
        "verse_full",
        verse_span=11,
        depth=depth,
    )
    assert sections == [
        "摘要",
        "经文背景",
        "段落脉络",
        "经文解释",
        "今日回应",
    ]
    plan = build_output_plan(
        "verse_full",
        question="请分别说说背景和脉络",
        verse_span=11,
        surface="assistant",
        wants_followups=False,
        depth=depth,
    )
    assert plan["lead"] is True
    assert plan["sections"] == sections
    assert plan["depth"] == "oia_deep"
    assert plan["max_followups"] == 0


def test_verse_quick_half_sheet_oia_compact():
    plan = build_output_plan(
        "verse_quick",
        verse_span=1,
        surface="half_sheet",
        question="请解读：约 3:16",
    )
    assert plan["depth"] == "oia_compact"
    assert plan["sections"] == [
        "摘要",
        "经文背景",
        "经文解释",
        "今日回应",
    ]


def test_verse_quick_tab_oia_standard():
    plan = build_output_plan("verse_quick", verse_span=1, surface="assistant")
    assert plan["depth"] == "oia_standard"
    assert "经文背景" in plan["sections"]
    assert plan["max_followups"] == 0


def test_assistant_followups_cap():
    plan = build_output_plan(
        "chat_explain",
        surface="assistant",
        wants_followups=True,
    )
    assert plan["sections"] == [
        "摘要",
        "经文背景",
        "经文解释",
        "今日回应",
    ]
    assert plan["max_followups"] == 3


def test_half_sheet_oia_compact_plan_policy():
    plan = build_output_plan(
        "verse_full",
        question="请解读：约 3:16",
        verse_span=1,
        surface="half_sheet",
    )
    assert plan["section_policy"] == "oia"
    assert plan["sections"] == [
        "摘要",
        "经文背景",
        "经文解释",
        "今日回应",
    ]
