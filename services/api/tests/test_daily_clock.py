"""每日经文时钟单测。"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.content.daily_clock import verse_day_for_date  # noqa: E402


def test_verse_day_for_date_cycles():
    pool = 365
    assert verse_day_for_date(date(2026, 1, 1), pool) == 1
    assert verse_day_for_date(date(2026, 7, 3), pool) == 184
    assert verse_day_for_date(date(2026, 12, 31), pool) == 365


def test_verse_day_same_for_all_users_on_same_calendar_day():
    pool = 365
    d = date(2026, 3, 15)
    assert verse_day_for_date(d, pool) == verse_day_for_date(d, pool)
