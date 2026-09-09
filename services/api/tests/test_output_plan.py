"""output_plan 单测（P1 meta 骨架契约）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.output_plan import build_output_plan, planned_section_titles  # noqa: E402
from app.ai.depth_router import resolve_depth  # noqa: E402


def test_verse_full_passage_plan():
    sections = planned_section_titles(
        "verse_full",
        verse_span=11,
        depth=resolve_depth(
            "verse_full",
            "请分别说说背景和脉络",
            verse_span=11,
            surface="half_sheet",
        ),
    )
    assert sections == ["摘要", "经文背景", "段落脉络", "经文解释"]
    plan = build_output_plan(
        "verse_full",
        question="请分别说说背景和脉络",
        verse_span=11,
        surface="half_sheet",
        wants_followups=False,
    )
    assert plan["lead"] is True
    assert plan["sections"] == sections
    assert plan["depth"] == "deep"
    assert plan["budget_chars"] >= 820
    assert plan["max_followups"] == 0


def test_verse_quick_half_sheet_flash():
    plan = build_output_plan(
        "verse_quick",
        verse_span=1,
        surface="half_sheet",
        question="请解读：约 3:16",
    )
    assert plan["depth"] == "flash"
    assert plan["sections"] == ["摘要"]


def test_verse_quick_short_plan():
    plan = build_output_plan("verse_quick", verse_span=1, surface="assistant")
    assert "经文解释" in plan["sections"] or plan["depth"] == "flash"
    assert plan["max_followups"] == 0


def test_assistant_followups_cap():
    plan = build_output_plan(
        "chat_explain",
        surface="assistant",
        wants_followups=True,
    )
    assert plan["sections"] == ["摘要", "背景", "经文解释"]
    assert plan["max_followups"] == 3


def test_half_sheet_flash_plan_policy():
    plan = build_output_plan(
        "verse_full",
        question="请解读：约 3:16",
        verse_span=1,
        surface="half_sheet",
    )
    assert plan["section_policy"] == "lead_only"
    assert plan["sections"] == ["摘要"]
