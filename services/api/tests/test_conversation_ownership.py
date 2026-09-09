"""会话 ownership 单测（无 DB）。"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai import conversation_store as cs  # noqa: E402


def test_anonymous_conversation_not_owned_by_anyone():
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = (None, None)
    owned = cs._conversation_owned(
        conn,
        "00000000-0000-4000-8000-000000000001",
        device_id="dev-a",
        user_id=None,
    )
    assert owned is False


def test_device_match_owned(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = ("dev-a", None)
    owned = cs._conversation_owned(conn, "00000000-0000-4000-8000-000000000001", device_id="dev-a", user_id=None)
    assert owned is True
