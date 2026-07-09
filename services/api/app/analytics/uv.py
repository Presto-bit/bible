"""每日 UV：设备为主键，登录后归并 user_id（方案 C）。"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_SKIP_PREFIXES = ("/health", "/admin", "/docs", "/openapi.json", "/redoc")

# 统计去重身份（人去重：同 user 多设备仍计多 UV；同设备游客→登录计 1）
UV_IDENTITY_SQL = "COALESCE(user_id::text, device_fingerprint)"


def should_record_uv(path: str, method: str) -> bool:
    if method.upper() == "OPTIONS":
        return False
    return not any(path.startswith(prefix) for prefix in _SKIP_PREFIXES)


def normalize_device_id(device_id: str | None) -> str | None:
    device = (device_id or "").strip()
    if not device:
        return None
    return device[:128]


def resolve_device_fingerprint(
    *, user_id: str | None, device_id: str | None
) -> str | None:
    device = normalize_device_id(device_id)
    if device:
        return device
    if user_id:
        return f"uid:{user_id}"
    return None


def legacy_visitor_key(*, user_id: str | None, device_id: str | None) -> str | None:
    """兼容旧 visitor_key 列与测试。"""
    if user_id:
        return f"u:{user_id}"
    device = normalize_device_id(device_id)
    if device:
        return f"d:{device}"
    return None


def visitor_key(*, user_id: str | None, device_id: str | None) -> str | None:
    return legacy_visitor_key(user_id=user_id, device_id=device_id)


def _has_uv_v2(conn) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'daily_active_visitors'
          AND column_name = 'device_fingerprint'
        LIMIT 1
        """
    ).fetchone()
    return bool(row)


def record_daily_visit(*, user_id: str | None, device_id: str | None) -> None:
    fingerprint = resolve_device_fingerprint(user_id=user_id, device_id=device_id)
    if not fingerprint:
        return
    legacy_key = legacy_visitor_key(user_id=user_id, device_id=device_id) or fingerprint
    try:
        from ..db import get_pool

        pool = get_pool()
        with pool.connection() as conn:
            if _has_uv_v2(conn):
                conn.execute(
                    """
                    INSERT INTO daily_active_visitors (
                      visit_date, device_fingerprint, user_id, visitor_key,
                      user_bound_at, updated_at
                    )
                    VALUES (
                      CURRENT_DATE, %s, %s, %s,
                      CASE WHEN %s IS NOT NULL THEN now() ELSE NULL END,
                      now()
                    )
                    ON CONFLICT (visit_date, device_fingerprint)
                    DO UPDATE SET
                      user_id = COALESCE(EXCLUDED.user_id, daily_active_visitors.user_id),
                      user_bound_at = COALESCE(
                        daily_active_visitors.user_bound_at,
                        CASE WHEN EXCLUDED.user_id IS NOT NULL THEN now() ELSE NULL END
                      ),
                      visitor_key = CASE
                        WHEN EXCLUDED.user_id IS NOT NULL THEN 'u:' || EXCLUDED.user_id::text
                        ELSE daily_active_visitors.visitor_key
                      END,
                      updated_at = now()
                    """,
                    (fingerprint, user_id, legacy_key, user_id),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO daily_active_visitors (visit_date, visitor_key)
                    VALUES (CURRENT_DATE, %s)
                    ON CONFLICT (visit_date, visitor_key) DO NOTHING
                    """,
                    (legacy_key,),
                )
            conn.commit()
    except Exception as exc:
        logger.warning("UV 记录失败（已忽略）：%s", exc)
