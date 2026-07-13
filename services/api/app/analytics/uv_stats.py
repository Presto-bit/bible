"""UV 统计 SQL 片段（V2 去重 + 看板指标）。"""
from __future__ import annotations

from .uv import UV_IDENTITY_SQL, uv_identity_sql

UV_IDENTITY_A = uv_identity_sql("a")
UV_IDENTITY_B = uv_identity_sql("b")


def uv_schema_v2(conn) -> bool:
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


def uv_deduped_count_sql(*, where: str = "visit_date = current_date") -> str:
    return f"""
        SELECT count(DISTINCT {UV_IDENTITY_SQL})
        FROM daily_active_visitors
        WHERE {where}
    """


def uv_guest_rows_sql(*, where: str = "visit_date = current_date") -> str:
    """纯游客 UV：无 user_id、也未绑定账号的设备（按身份去重）。"""
    return f"""
        SELECT count(DISTINCT {UV_IDENTITY_SQL})
        FROM daily_active_visitors
        WHERE {where}
          AND user_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM device_user_bindings dub
            WHERE dub.device_fingerprint = daily_active_visitors.device_fingerprint
          )
    """


def uv_login_rows_sql(*, where: str = "visit_date = current_date") -> str:
    return f"""
        SELECT count(*) FROM daily_active_visitors
        WHERE {where} AND user_id IS NOT NULL
    """


def uv_login_users_sql(*, where: str = "visit_date = current_date") -> str:
    """当日去重后归属到账号的 UV（含设备绑定）。"""
    return f"""
        SELECT count(DISTINCT {UV_IDENTITY_SQL})
        FROM daily_active_visitors
        WHERE {where}
          AND (
            user_id IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM device_user_bindings dub
              WHERE dub.device_fingerprint = daily_active_visitors.device_fingerprint
            )
          )
    """


def uv_converted_sql(*, where: str = "visit_date = current_date") -> str:
    """当日设备在当天绑定 user_id（游客→登录）。"""
    return f"""
        SELECT count(*) FROM daily_active_visitors
        WHERE {where}
          AND user_id IS NOT NULL
          AND user_bound_at IS NOT NULL
          AND user_bound_at::date = visit_date
    """


def uv_series_deduped_sql() -> str:
    return f"""
        SELECT visit_date::text, count(DISTINCT {UV_IDENTITY_SQL})
        FROM daily_active_visitors
        WHERE visit_date >= current_date - %s::int
        GROUP BY visit_date
        ORDER BY visit_date
    """
