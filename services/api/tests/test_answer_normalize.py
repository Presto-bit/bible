"""answer_normalize / answer_schema 单测。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.answer_normalize import (  # noqa: E402
    is_prose_wall,
    normalize_answer_markdown,
)
from app.ai.answer_schema import (  # noqa: E402
    effective_budget_for_scene,
    max_tokens_for_scene,
)
from app.ai.parse_output import verse_needs_length_continuation  # noqa: E402


def test_normalize_prose_to_bullets():
    raw = (
        "### 摘要\n耶稣为门徒洗脚。\n\n"
        "### 背景\n"
        "这是逾越节前最后的晚餐。门徒仍在争论谁为大。耶稣却亲自为他们洗脚。\n\n"
        "### 经文解释\n"
        "洗脚象征服事。主叫门徒彼此相爱。"
    )
    out = normalize_answer_markdown(raw, "verse_full")
    assert "- " in out
    assert is_prose_wall(out, "verse_full") is False


def test_max_tokens_verse_full_capped():
    assert max_tokens_for_scene("verse_full", verse_span=1) == 900
    assert max_tokens_for_scene("verse_full", verse_span=5) <= 1020
    assert max_tokens_for_scene("verse_full", verse_span=11) == 1180


def test_effective_budget_scales_with_span():
    single = effective_budget_for_scene("verse_full", verse_span=1)
    passage = effective_budget_for_scene("verse_full", verse_span=11)
    assert single is not None and passage is not None
    assert passage.total_chars >= 920
    assert passage.max_bullets >= single.max_bullets


def test_max_tokens_narrow():
    assert max_tokens_for_scene("chat_explain", narrow=True) == 400


def test_length_continuation_skipped_when_complete():
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 背景\n- 约翰福音第三章。\n\n"
        "### 经文解释\n- 强调神主动赐下独生子。"
    )
    assert verse_needs_length_continuation(
        "verse_full",
        body,
        finish_reason="length",
    ) is False
