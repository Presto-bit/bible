"""AI 请求明细日志（管理统计）。"""
from __future__ import annotations

import logging
import threading

from ..db import get_pool
from .usage import _ensure_guest  # noqa: PLC2701

logger = logging.getLogger(__name__)

_schema_lock = threading.Lock()
_schema_ready = False


def _ensure_request_log_schema(conn) -> None:
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        conn.execute(
            "ALTER TABLE ai_request_log ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN"
        )
        conn.execute(
            "ALTER TABLE ai_request_log ADD COLUMN IF NOT EXISTS latency_ms INT"
        )
        conn.commit()
        _schema_ready = True


def log_ai_request(
    *,
    device_id: str | None,
    user_id: str | None,
    scene: str | None,
    mode: str | None,
    surface: str | None,
    status: str = "ok",
    cache_hit: bool | None = None,
    latency_ms: int | None = None,
) -> None:
    try:
        pool = get_pool()
        with pool.connection() as conn:
            _ensure_request_log_schema(conn)
            guest_id = _ensure_guest(conn, device_id) if device_id else None
            conn.execute(
                """
                INSERT INTO ai_request_log
                  (user_id, guest_id, scene, mode, surface, status, cache_hit, latency_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    guest_id,
                    scene,
                    mode,
                    surface,
                    status,
                    cache_hit,
                    latency_ms,
                ),
            )
            conn.commit()
    except Exception as exc:
        logger.warning("AI 请求日志写入失败（已忽略）：%s", exc)
