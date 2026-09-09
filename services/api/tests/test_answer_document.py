"""answer_document 单测（P0 AnswerDocument 契约）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.answer_document import (  # noqa: E402
    DOCUMENT_SCHEMA_VERSION,
    build_answer_document,
    build_done_sse_payload,
    section_slug,
)


def test_section_slug():
    assert section_slug("经文背景") == "sec-经文背景"
    assert section_slug("  ") == "sec-section"


def test_build_answer_document_passage():
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 经文背景\n- 背景一。\n\n"
        "### 段落脉络\n- 脉络一。\n\n"
        "### 经文解释\n- 解释一。\n"
    )
    doc = build_answer_document(body, ["追问一？"])
    assert doc["schema_version"] == DOCUMENT_SCHEMA_VERSION
    assert doc["markdown"] == body
    titles = [s["title"] for s in doc["sections"]]
    assert titles == ["摘要", "经文背景", "段落脉络", "经文解释"]
    assert all(s["id"].startswith("sec-") for s in doc["sections"])
    assert doc["followups"] == ["追问一？"]
    assert doc["lead"] == "神爱世人。"
    assert any(b.get("type") == "list" for b in doc["blocks"])


def test_build_done_sse_payload_includes_document():
    text = "### 摘要\n摘要。\n\n### 经文解释\n- 要点。"
    payload = build_done_sse_payload(text, scene="verse_full")
    assert payload["document"]["markdown"].startswith("### 摘要")
    assert payload["document"]["schema_version"] == DOCUMENT_SCHEMA_VERSION
    assert payload["sections"] == payload["document"]["sections"]
    assert "document" in payload
