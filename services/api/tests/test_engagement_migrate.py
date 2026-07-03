"""每日经文互动迁移单测。"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.content.engagement_migrate import migrate_daily_verse_engagement  # noqa: E402


def test_migrate_skips_invalid_or_same_code():
    conn = MagicMock()
    assert migrate_daily_verse_engagement(conn, "", "12345678") == 0
    assert migrate_daily_verse_engagement(conn, "12345678", "12345678") == 0
    assert migrate_daily_verse_engagement(conn, "abc", "12345678") == 0
    conn.execute.assert_not_called()


def test_migrate_moves_likes_and_shares():
    conn = MagicMock()
    update_cur = MagicMock()
    update_cur.rowcount = 2
    conn.execute.side_effect = [None, update_cur, None]

    moved = migrate_daily_verse_engagement(conn, "11111111", "22222222")

    assert moved == 2
    assert conn.execute.call_count == 3
    delete_sql = conn.execute.call_args_list[0].args[0]
    assert "DELETE FROM daily_verse_like" in delete_sql
    update_like_args = conn.execute.call_args_list[1].args
    assert update_like_args == (
        "UPDATE daily_verse_like SET user_code = %s WHERE user_code = %s",
        ("22222222", "11111111"),
    )
    update_share_args = conn.execute.call_args_list[2].args
    assert "daily_verse_share" in update_share_args[0]
