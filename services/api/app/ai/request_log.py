"""AI 请求明细日志（管理统计）。"""
from __future__ import annotations

import logging

from ..db import get_pool
from .usage import _ensure_guest  # noqa: PLC2701

logger = logging.getLogger(__name__)


def log_ai_request(
    *,
    device_id: str | None,
    user_id: str | None,
    scene: str | None,
    mode: str | None,
    surface: str | None,
    status: str = "ok",
) -> None:
    try:
        pool = get_pool()
        with pool.connection() as conn:
            guest_id = _ensure_guest(conn, device_id) if device_id else None
            conn.execute(
                """
                INSERT INTO ai_request_log
                  (user_id, guest_id, scene, mode, surface, status)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_id, guest_id, scene, mode, surface, status),
            )
            conn.commit()
    except Exception as exc:
        logger.warning("AI 请求日志写入失败（已忽略）：%s", exc)
