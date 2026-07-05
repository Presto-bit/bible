"""每日内容时钟：全站按北京时间自然日 0:00 切换，保证用户看到同一篇经文。"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

_CN_TZ = timezone(timedelta(hours=8))


def china_today() -> date:
    return datetime.now(_CN_TZ).date()


def verse_day_for_date(d: date, pool_size: int) -> int:
    if pool_size < 1:
        raise ValueError("pool_size must be positive")
    return (d.timetuple().tm_yday - 1) % pool_size + 1
