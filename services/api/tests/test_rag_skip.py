"""RAG 跳过策略单测（无 DB）。"""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.rag_policy import skip_rag_for_passage  # noqa: E402


def _ref():
    return SimpleNamespace(
        osis="JHN.3.16",
        book_id="JHN",
        book_name="约翰福音",
        chapter=3,
        verse_start=16,
        verse_end=16,
        display="约翰福音 3:16",
    )


def test_half_sheet_skips_rag():
    assert skip_rag_for_passage(
        surface="half_sheet",
        scene_id="verse_quick",
        question="请解读：约翰福音 3:16",
        ref=_ref(),
        verse_span=1,
        has_prior_turns=False,
    )


def test_assistant_default_explain_skips_rag():
    assert skip_rag_for_passage(
        surface="assistant",
        scene_id="verse_quick",
        question="请解读：约翰福音 3:16",
        ref=_ref(),
        verse_span=1,
        has_prior_turns=False,
    )


def test_assistant_followup_keeps_rag():
    assert not skip_rag_for_passage(
        surface="assistant",
        scene_id="verse_quick",
        question="再深入一点",
        ref=_ref(),
        verse_span=1,
        has_prior_turns=True,
    )


def test_assistant_custom_question_keeps_rag():
    assert not skip_rag_for_passage(
        surface="assistant",
        scene_id="verse_quick",
        question="「永生」在这里具体指什么？",
        ref=_ref(),
        verse_span=1,
        has_prior_turns=False,
    )


def test_long_span_keeps_rag_on_assistant():
    assert not skip_rag_for_passage(
        surface="assistant",
        scene_id="verse_full",
        question="请解读：约翰福音 3:16",
        ref=_ref(),
        verse_span=8,
        has_prior_turns=False,
    )
