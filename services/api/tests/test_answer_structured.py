"""answer_render / answer_structured 单测。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.answer_render import render_answer_draft  # noqa: E402
from app.ai.answer_schema import missing_required_sections  # noqa: E402
from app.ai.answer_structured import (  # noqa: E402
    needs_structure_repair,
    parse_answer_json,
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
    assert missing_required_sections(body, "verse_full") == ["背景", "经文解释"]


def test_needs_structure_repair_prose():
    body = (
        "### 摘要\n摘要。\n\n"
        "### 背景\n"
        "这是一段很长的散文没有任何列表格式应该被识别为散文墙需要修复处理。"
    )
    assert needs_structure_repair(body, "verse_full")
