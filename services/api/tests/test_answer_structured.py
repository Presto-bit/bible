"""answer_render / answer_structured 单测。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.answer_render import render_answer_draft  # noqa: E402
from app.ai.answer_schema import missing_required_sections  # noqa: E402
from app.ai.answer_structured import (  # noqa: E402
    _chat_json_guide,
    _message_variants,
    needs_structure_repair,
    parse_answer_json,
    recover_empty_response,
)


def test_parse_answer_json():
    raw = '```json\n{"summary":"神爱世人","sections":[{"title":"经文解释","items":["要点一"]}]}\n```'
    data = parse_answer_json(raw)
    assert data is not None
    assert data["summary"] == "神爱世人"


def test_render_answer_draft():
    md = render_answer_draft(
        {
            "summary": "耶稣洗脚。",
            "sections": [
                {"title": "背景", "items": ["逾越节前。", "门徒争大。"]},
                {"title": "经文解释", "items": ["服事的榜样。"]},
            ],
        },
        "verse_full",
    )
    assert "### 摘要" in md
    assert "### 背景" in md
    assert "- 逾越节前。" in md


def test_missing_required_sections():
    body = "### 摘要\n只有摘要。"
    assert missing_required_sections(body, "verse_full") == ["经文背景", "经文解释"]


def test_missing_required_sections_passage_span():
    body = (
        "### 摘要\n摘要。\n\n"
        "### 经文背景\n- 背景一。\n\n"
        "### 经文解释\n- 解释一。\n"
    )
    assert missing_required_sections(body, "verse_full", verse_span=11) == ["段落脉络"]
    body_ok = (
        "### 摘要\n摘要。\n\n"
        "### 经文背景\n- 背景一。\n\n"
        "### 段落脉络\n- 脉络一。\n\n"
        "### 经文解释\n- 解释一。\n"
    )
    assert missing_required_sections(body_ok, "verse_full", verse_span=11) == []


def test_missing_required_sections_accepts_legacy_background_title():
    body = (
        "### 摘要\n摘要。\n\n"
        "### 背景\n- 背景一。\n\n"
        "### 经文解释\n- 解释一。\n"
    )
    assert missing_required_sections(body, "verse_full") == []


def test_needs_structure_repair_prose():
    body = (
        "### 摘要\n摘要。\n\n"
        "### 背景\n"
        "这是一段很长的散文没有任何列表格式应该被识别为散文墙需要修复处理。"
    )
    assert needs_structure_repair(body, "verse_full")


def test_chat_json_guide():
    guide = _chat_json_guide("chat_explain")
    assert guide is not None
    assert "背景" in guide
    assert "经文解释" in guide
    assert _chat_json_guide("chat_general") is None


def test_message_variants_strips_history():
    msgs = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "u1"},
        {"role": "assistant", "content": "a1"},
        {"role": "user", "content": "u2"},
    ]
    variants = _message_variants(msgs)
    assert variants[0] == [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "u2"},
    ]


def test_recover_empty_response_chat(monkeypatch):
    calls: list[int] = []

    def fake_complete(msgs, *, max_tokens, temperature=0.3):
        calls.append(max_tokens)
        return (
            "### 摘要\n神爱世人。\n\n"
            "### 背景\n- 犹太教背景。\n\n"
            "### 经文解释\n- 爱的定义。"
        )

    monkeypatch.setattr(
        "app.ai.answer_structured.complete_chat",
        fake_complete,
    )
    msgs = [
        {"role": "system", "content": "你是小爱"},
        {"role": "user", "content": "解释这段经文"},
    ]
    out = recover_empty_response(
        msgs,
        "chat_explain",
        max_tokens=400,
        narrow=True,
    )
    assert out is not None
    assert "### 摘要" in out
    assert calls and calls[0] >= 900
