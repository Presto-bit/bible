"""daily_verse_warm：爬坡与合成账号识别。"""
from __future__ import annotations

from datetime import date

from app.analytics.exclude import is_excluded_user_code
from app.content.daily_verse_warm import (
    _writes_cap_for_tick,
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

    settings = _merge({})
    early = datetime(2026, 6, 1, 5, 30, tzinfo=ZoneInfo("Asia/Shanghai"))
    assert day_progress_fraction(early, settings) == 0.0


def test_manual_tick_caps_small_batch():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    settings = _merge({"manual_max_writes": 2, "cron_max_writes": 8})
    now = datetime(2026, 6, 1, 21, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
    cap = _writes_cap_for_tick(gap=40, mode="manual", settings=settings, now=now)
    assert cap == 2


def test_cron_spread_lowers_burst():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    settings = _merge(
        {
            "cron_max_writes": 8,
            "catch_up_policy": "spread_by_remaining_slots",
            "cron_interval_minutes": 30,
            "day_start_hour": 6,
            "day_end_hour": 23,
        }
    )
    now = datetime(2026, 6, 1, 12, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
    cap = _writes_cap_for_tick(gap=40, mode="cron", settings=settings, now=now)
    assert cap <= 8
    assert cap >= 1
