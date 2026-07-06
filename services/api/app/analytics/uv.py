"""每日 UV：按用户或设备去重，失败不阻断请求。"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_SKIP_PREFIXES = ("/health", "/admin", "/docs", "/openapi.json", "/redoc")


def should_record_uv(path: str, method: str) -> bool:
    if method.upper() == "OPTIONS":
        return False
    return not any(path.startswith(prefix) for prefix in _SKIP_PREFIXES)


def visitor_key(*, user_id: str | None, device_id: str | None) -> str | None:
    if user_id:
        return f"u:{user_id}"
    device = (device_id or "").strip()
    if device:
        return f"d:{device[:128]}"
    return None


def record_daily_visit(*, user_id: str | None, device_id: str | None) -> None:
    key = visitor_key(user_id=user_id, device_id=device_id)
    if not key:
        return
    try:
        from ..db import get_pool

        pool = get_pool()
        with pool.connection() as conn:
            conn.execute(
                """
                INSERT INTO daily_active_visitors (visit_date, visitor_key)
                VALUES (CURRENT_DATE, %s)
                ON CONFLICT (visit_date, visitor_key) DO NOTHING
                """,
                (key,),
            )
            conn.commit()
    except Exception as exc:
        logger.warning("UV 记录失败（已忽略）：%s", exc)
