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


def test_soft_trim_keeps_moderately_long_bullet():
    long_item = "这" * 70 + "。"
    raw = f"### 摘要\n短。\n\n### 经文解释\n- {long_item}"
    out = normalize_answer_markdown(raw, "verse_full", depth="standard", soft_max=900)
    assert long_item in out


def test_flash_keeps_prose_body():
    raw = (
        "### 摘要\n神爱世人。\n\n"
        "### 经文解释\n"
        "这是第一段自然叙述，说明神主动赐下儿子。\n"
        "第二段补充信者得永生的含义。"
    )
    out = normalize_answer_markdown(
        raw,
        "verse_full",
        depth="flash",
        prefer_prose=True,
        soft_max=400,
    )
    assert "- " not in out.split("### 经文解释")[-1]
    assert "自然叙述" in out


def test_long_passage_caps_background_and_explain_bullets():
    raw = (
        "### 摘要\n马太15章主线。\n\n"
        "### 经文背景\n"
        + "\n".join(f"- 背景要点{i}。" for i in range(1, 7))
        + "\n\n### 段落脉络\n"
        + "\n".join(f"- 脉络{i}。" for i in range(1, 5))
        + "\n\n### 经文解释\n"
        + "\n".join(f"- 解释碎点{i}。" for i in range(1, 9))
    )
    out = normalize_answer_markdown(raw, "verse_full", verse_span=39, depth="deep")
    bg = out.split("### 段落脉络")[0]
    explain = out.split("### 经文解释")[-1]
    assert bg.count("- ") <= 2
    assert explain.count("- ") <= 5
    assert "（续）" not in out


def test_normalize_drops_incomplete_tail_bullet():
    raw = (
        "### 摘要\n摘要。\n\n"
        "### 经文背景\n"
        "- 完整背景句。\n"
        "- 说到一半就被"
    )
    out = normalize_answer_markdown(raw, "verse_full", verse_span=11)
    assert "说到一半就被" not in out
    assert "完整背景句" in out


def test_summary_renders_as_bullet():
    raw = "### 摘要\n神爱世人，甚至将独生子赐给他们。"
    out = normalize_answer_markdown(raw, "verse_full")
    assert "### 摘要\n- 神爱世人" in out


def test_format_only_preserves_long_bullet():
    long_item = "这" * 130 + "。"
    raw = f"### 摘要\n短。\n\n### 经文解释\n- {long_item}"
    trimmed = normalize_answer_markdown(raw, "verse_full", depth="standard", soft_max=200)
    preserved = normalize_answer_markdown(raw, "verse_full", format_only=True)
    assert long_item in preserved
    assert long_item not in trimmed
