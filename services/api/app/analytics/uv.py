"""每日 UV：设备为主键，登录后归并 user_id（方案 C）。"""
from __future__ import annotations

import logging

from ..time_cn import CN_TODAY_SQL

logger = logging.getLogger(__name__)

_SKIP_PREFIXES = ("/health", "/admin", "/docs", "/openapi.json", "/redoc")

# 统计去重身份：优先归并到 8 位 user_code（多设备 / 先游客后登录只计 1）；否则按设备计
def uv_identity_sql(alias: str | None = None) -> str:
    prefix = f"{alias}." if alias else "daily_active_visitors."
    fp = f"{alias}.device_fingerprint" if alias else "daily_active_visitors.device_fingerprint"
    by_user = f"""(
      SELECT ac.user_code
      FROM accounts ac
      WHERE ac.user_id = {prefix}user_id
      LIMIT 1
    )"""
    by_bind = f"""(
      SELECT dub.user_code
      FROM device_user_bindings dub
      WHERE dub.device_fingerprint = {fp}
      LIMIT 1
    )"""
    return (
        f"COALESCE({by_user}, {by_bind}, "
        f"{prefix}user_id::text, {prefix}device_fingerprint)"
    )


UV_IDENTITY_SQL = uv_identity_sql()


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


def _lookup_bound_user_id(conn, device_fingerprint: str) -> str | None:
    row = conn.execute(
        """
        SELECT ac.user_id::text
        FROM device_user_bindings dub
        JOIN accounts ac ON ac.user_code = dub.user_code
        WHERE dub.device_fingerprint = %s
        LIMIT 1
        """,
        (device_fingerprint,),
    ).fetchone()
    return row[0] if row else None


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
                effective_user_id = user_id
                if not effective_user_id:
                    effective_user_id = _lookup_bound_user_id(conn, fingerprint)
                conn.execute(
                    f"""
                    INSERT INTO daily_active_visitors (
                      visit_date, device_fingerprint, user_id, visitor_key,
                      user_bound_at, updated_at
                    )
                    VALUES (
                      {CN_TODAY_SQL}, %s, %s, %s,
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
                    (fingerprint, effective_user_id, legacy_key, effective_user_id),
                )
            else:
                conn.execute(
                    f"""
                    INSERT INTO daily_active_visitors (visit_date, visitor_key)
                    VALUES ({CN_TODAY_SQL}, %s)
                    ON CONFLICT (visit_date, visitor_key) DO NOTHING
                    """,
                    (legacy_key,),
                )
            conn.commit()
    except Exception as exc:
        logger.warning("UV 记录失败（已忽略）：%s", exc)
