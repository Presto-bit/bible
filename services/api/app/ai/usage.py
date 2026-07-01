"""游客 AI 日额度（X-Guest-Id → guest_devices + ai_usage_daily）。

device_id 为客户端持久化的设备指纹字符串；映射到 guest_devices.guest_id(UUID)，
再按 (guest_id, 当日) 计数。无 device_id 时不限流（开发/内部调用）。
"""
from __future__ import annotations

import logging

from ..db import get_pool

logger = logging.getLogger(__name__)


def _ensure_guest(conn, device_id: str) -> str:
    row = conn.execute(
        "SELECT guest_id FROM guest_devices WHERE device_fingerprint = %s",
        (device_id,),
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE guest_devices SET last_seen_at = now() WHERE guest_id = %s",
            (row[0],),
        )
        return row[0]
    return conn.execute(
        "INSERT INTO guest_devices (device_fingerprint) VALUES (%s) RETURNING guest_id",
        (device_id,),
    ).fetchone()[0]


def consume_quota(device_id: str | None, limit: int) -> tuple[bool, int, int]:
    """预扣一次额度。返回 (allowed, used_after, limit)。

    allowed=False 时表示已达上限、未计数。
    """
    if not device_id:
        return True, 0, limit
    try:
        pool = get_pool()
        with pool.connection() as conn:
            guest_id = _ensure_guest(conn, device_id)
            used = conn.execute(
                "SELECT request_count FROM ai_usage_daily "
                "WHERE guest_id = %s AND usage_date = CURRENT_DATE",
                (guest_id,),
            ).fetchone()
            used = used[0] if used else 0
            if used >= limit:
                conn.commit()
                return False, used, limit
            conn.execute(
                "INSERT INTO ai_usage_daily (guest_id, usage_date, request_count) "
                "VALUES (%s, CURRENT_DATE, 1) "
                "ON CONFLICT (guest_id, usage_date) "
                "DO UPDATE SET request_count = ai_usage_daily.request_count + 1",
                (guest_id,),
            )
            conn.commit()
            return True, used + 1, limit
    except Exception as exc:
        # 额度库不可用时 fail-open：不阻断用户，仅记录告警
        logger.warning("额度库不可用，放行本次请求：%s", exc)
        return True, 0, limit
