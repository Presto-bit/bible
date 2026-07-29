"""群代祷清单 API 冒烟（无 DB 时跳过）。"""
from __future__ import annotations

import pytest

from app.db import ping
from app.social.group_prayer import ensure_group_prayer_schema
from app.db import get_pool


pytestmark = pytest.mark.skipif(not ping(), reason="数据库不可用")


def test_ensure_group_prayer_schema():
    ensure_group_prayer_schema(get_pool())
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_name = 'group_prayer'"
        ).fetchone()
        assert int(row[0]) >= 1
