"""analytics.exclude：测试/冒烟账号不计入统计。"""
from __future__ import annotations

from app.analytics.exclude import (
    clear_exclude_cache,
    is_excluded_device_id,
    is_excluded_user_code,
    should_exclude_visit,
    uv_not_excluded_sql,
)


def setup_function() -> None:
    clear_exclude_cache()


def test_exclude_smoke_user_code():
    assert is_excluded_user_code("99990001")
    assert not is_excluded_user_code("45716122")
    assert not is_excluded_user_code("")


def test_exclude_smoke_device():
    assert is_excluded_device_id("release-smoke-fixed")
    assert is_excluded_device_id("hijack-release-smoke-x")
    assert is_excluded_device_id("ip:127.0.0.1")
    assert is_excluded_device_id("ip:::1")
    assert not is_excluded_device_id("hw-a-abc123")


def test_should_exclude_visit():
    assert should_exclude_visit(user_code="99990001", device_id=None)
    assert should_exclude_visit(user_code=None, device_id="release-smoke-fixed")
    assert not should_exclude_visit(user_code="45716122", device_id="hw-a-1")


def test_uv_not_excluded_sql_contains_smoke_code():
    sql = uv_not_excluded_sql()
    assert "99990001" in sql
    assert "release-smoke" in sql
