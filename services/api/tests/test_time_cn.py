"""北京时间切日工具。"""
from datetime import timedelta

from app.time_cn import (
    CN_TODAY_SQL,
    china_today,
    cn_day_sql,
    cn_midnight_sql,
)


def test_cn_today_sql_uses_shanghai():
    assert "Asia/Shanghai" in CN_TODAY_SQL
    assert "now()" in CN_TODAY_SQL


def test_cn_day_sql_wraps_column():
    assert cn_day_sql("m.created_at") == "(timezone('Asia/Shanghai', m.created_at))::date"


def test_cn_midnight_sql_today_and_yesterday():
    today = cn_midnight_sql(0)
    yday = cn_midnight_sql(1)
    assert "Asia/Shanghai" in today
    assert "- 1" in yday
    assert today != yday


def test_china_today_is_shanghai_date(monkeypatch):
    from app import time_cn
    from datetime import datetime
    from zoneinfo import ZoneInfo

    fixed = datetime(2026, 7, 14, 1, 30, tzinfo=ZoneInfo("Asia/Shanghai"))
    class _FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is None:
                return fixed.replace(tzinfo=None)
            return fixed.astimezone(tz)

    monkeypatch.setattr(time_cn, "datetime", _FakeDateTime)
    assert china_today() == fixed.date()
