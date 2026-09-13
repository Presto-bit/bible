"""depth_router 单测（R1 · OIA）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.depth_router import resolve_depth  # noqa: E402
from app.ai.output_plan import build_output_plan  # noqa: E402


def test_half_sheet_single_verse_oia_compact():
    prof = resolve_depth(
        "verse_full",
        "请解读：约 3:16",
        verse_span=1,
        surface="half_sheet",
    )
    assert prof.depth == "oia_compact"
    assert prof.sections == ("摘要", "经文解释", "和上下文连", "今日回应")
    plan = build_output_plan(
        "verse_full",
        question="请解读：约 3:16",
        verse_span=1,
        surface="half_sheet",
        depth=prof,
    )
    assert plan["depth"] == "oia_compact"
    assert plan["sections"] == list(prof.sections)
    assert plan["max_followups"] == 0


def test_half_sheet_multi_verse_still_oia_compact():
    prof = resolve_depth(
        "verse_full",
        "请解读：约 3:16-20",
        verse_span=5,
        surface="half_sheet",
    )
    assert prof.depth == "oia_compact"
    assert "和上下文连" in prof.sections
    assert "今日回应" in prof.sections


def test_tab_single_verse_oia_standard():
    prof = resolve_depth(
        "verse_full",
        "请解读：约 3:16",
        verse_span=1,
        surface="assistant",
    )
    assert prof.depth == "oia_standard"
    assert prof.sections == ("摘要", "经文解释", "和上下文连", "今日回应")


def test_tab_deep_passage_oia_deep():
    prof = resolve_depth(
        "verse_full",
        "请分别说说背景和脉络",
        verse_span=11,
        surface="assistant",
    )
    assert prof.depth == "oia_deep"
    assert "段落脉络" in prof.sections


def test_study_scene():
    prof = resolve_depth("chat_study", "帮我预备查经", surface="assistant")
    assert prof.depth == "study"
    assert "讨论问题" in prof.sections or "结构大纲" in prof.sections


def test_chat_explain_tab_oia_standard():
    prof = resolve_depth(
        "chat_explain",
        "请解释这段经文",
        verse_span=1,
        surface="assistant",
    )
    assert prof.depth == "oia_standard"


def test_tab_relay_full_oia_uses_supplement():
    prof = resolve_depth(
        "chat_explain",
        "请按 OIA 四步完整解读「约 3:16」：摘要、经文解释、和上下文连、今日回应。",
        has_prior_turns=True,
        surface="assistant",
    )
    assert prof.depth == "flash"
    assert prof.sections == ("补充说明",)


def test_narrow_chip_flash():
    prof = resolve_depth(
        "chat_explain",
        "更多关联",
        narrow=True,
        has_prior_turns=True,
        verse_span=1,
        surface="assistant",
    )
    assert prof.depth == "flash"
