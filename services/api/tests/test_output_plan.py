"""output_plan 单测（P1 meta 骨架契约）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.output_plan import build_output_plan, planned_section_titles  # noqa: E402


def test_verse_full_passage_plan():
    sections = planned_section_titles("verse_full", verse_span=11)
    assert sections == ["摘要", "经文背景", "段落脉络", "经文解释"]
    plan = build_output_plan(
        "verse_full",
        verse_span=11,
        surface="half_sheet",
        wants_followups=False,
    )
    assert plan["lead"] is True
    assert plan["sections"] == sections
    assert plan["budget_chars"] >= 820
    assert plan["max_followups"] == 0


def test_verse_quick_short_plan():
    plan = build_output_plan("verse_quick", verse_span=1, surface="half_sheet")
    assert plan["sections"] == ["摘要", "经文解释"]
    assert plan["max_followups"] == 0


def test_assistant_followups_cap():
    plan = build_output_plan(
        "chat_explain",
        surface="assistant",
        wants_followups=True,
    )
    assert plan["sections"] == ["摘要", "背景", "经文解释"]
    assert plan["max_followups"] == 3
