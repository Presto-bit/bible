"""LLM 客户端单测（thinking 关闭、payload 契约）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.llm import _chat_payload  # noqa: E402


def test_chat_payload_disables_thinking_by_default():
    payload = _chat_payload(
        messages=[{"role": "user", "content": "hi"}],
        temperature=0.6,
        max_tokens=100,
        stream=True,
    )
    assert payload.get("thinking") == {"type": "disabled"}


def test_chat_payload_stream_flag():
    payload = _chat_payload(
        messages=[{"role": "user", "content": "hi"}],
        temperature=0.3,
        max_tokens=50,
        stream=False,
    )
    assert payload["stream"] is False
    assert payload["model"]
