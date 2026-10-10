"""daily_verse_warm：爬坡与合成账号识别。"""
from __future__ import annotations

from datetime import date

from app.analytics.exclude import is_excluded_user_code
from app.content.daily_verse_warm import (
    day_progress_fraction,
    is_synthetic_engagement_user_code,
    synthetic_user_code,
    target_cap_for_date,
)
from app.content.daily_verse_warm_settings import _merge


def test_synthetic_user_codes():
    assert synthetic_user_code(1) == "88000001"
    assert synthetic_user_code(99) == "88000099"
    assert is_synthetic_engagement_user_code("88000042")
    assert not is_synthetic_engagement_user_code("45716122")
    assert is_excluded_user_code("88000001")


def test_target_cap_ramps_from_min():
    settings = _merge({"t0": "2026-01-01", "cap_min": 10, "cap_max": 100, "ramp_days": 50})
    d0 = target_cap_for_date(settings, date(2026, 1, 1))
    d50 = target_cap_for_date(settings, date(2026, 2, 20))
    assert 8 <= d0 <= 15
    assert d50 >= 85


def test_day_progress_before_six_am():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    early = datetime(2026, 6, 1, 5, 30, tzinfo=ZoneInfo("Asia/Shanghai"))
    assert day_progress_fraction(early) == 0.0
