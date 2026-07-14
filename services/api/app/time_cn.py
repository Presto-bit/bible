"""全站业务日按 Asia/Shanghai（北京时间）切日。

Postgres / 容器常为 UTC：裸 CURRENT_DATE / ::date 会在北京 0:00–8:00
仍停在「昨天」。写入 DATE 列与按日统计统一走本模块。
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

CHINA_TZ_NAME = "Asia/Shanghai"
CN_OFFSET = timezone(timedelta(hours=8))

try:
    CHINA_TZ: timezone | ZoneInfo = ZoneInfo(CHINA_TZ_NAME)
except ZoneInfoNotFoundError:
    # 无 tzdata 时退回固定 UTC+8（无 DST，对中国足够）
    CHINA_TZ = CN_OFFSET

# 北京时间「今天」的 date 表达式（可直接嵌入 SQL）
CN_TODAY_SQL = f"(timezone('{CHINA_TZ_NAME}', now()))::date"


def china_today() -> date:
    return datetime.now(CHINA_TZ).date()


def china_now() -> datetime:
    return datetime.now(CHINA_TZ)


def cn_day_sql(column: str) -> str:
    """timestamptz → 北京日历日（用于 = / GROUP BY / BETWEEN）。"""
    return f"(timezone('{CHINA_TZ_NAME}', {column}))::date"


def cn_midnight_sql(days_ago: int | str = 0) -> str:
    """北京某自然日 00:00 对应的 timestamptz（用于区间下界，利于索引）。

    days_ago=0 今天；1 昨天；也可传入 SQL 片段如 '%s::int' / '{since}'。
    """
    if days_ago == 0:
        day = CN_TODAY_SQL
    elif isinstance(days_ago, int):
        day = f"({CN_TODAY_SQL} - {int(days_ago)})"
    else:
        day = f"({CN_TODAY_SQL} - ({days_ago}))"
    return f"(({day})::timestamp AT TIME ZONE '{CHINA_TZ_NAME}')"
