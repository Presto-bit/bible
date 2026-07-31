"""UV 统计 SQL 片段（V2 去重 + 看板指标）。"""
from __future__ import annotations

from ..time_cn import CN_TODAY_SQL, cn_day_sql
from .uv import (
    UV_GUEST_IDENTITY_SQL,
    UV_IDENTITY_SQL,
    uv_identity_sql,
)

UV_IDENTITY_A = uv_identity_sql("a")
UV_IDENTITY_B = uv_identity_sql("b")

_TODAY = f"visit_date = {CN_TODAY_SQL}"


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


def uv_attributed_where(alias: str | None = None) -> str:
    """已归属真实账号：能解析到 accounts.user_code（排除纯游客）；不要求设密/绑手机。"""
    return f"({uv_identity_sql(alias)} IS NOT NULL)"


def uv_deduped_count_sql(*, where: str = _TODAY) -> str:
    """概览 UV：按 accounts.user_code 去重，不含游客设备。"""
    return f"""
        SELECT count(DISTINCT {UV_IDENTITY_SQL})
        FROM daily_active_visitors
        WHERE {where}
          AND {uv_attributed_where()}
    """


def uv_guest_rows_sql(*, where: str = _TODAY) -> str:
    """未计入概览 UV：无法解析到 accounts 的访客设备去重。"""
    return f"""
        SELECT count(DISTINCT {UV_GUEST_IDENTITY_SQL})
        FROM daily_active_visitors
        WHERE {where}
          AND NOT {uv_attributed_where()}
    """


def uv_login_rows_sql(*, where: str = _TODAY) -> str:
    """已归属账号访问行数（未去重；与概览口径一致）。"""
    return f"""
        SELECT count(*) FROM daily_active_visitors
        WHERE {where}
          AND {uv_attributed_where()}
    """


def uv_login_users_sql(*, where: str = _TODAY) -> str:
    """当日去重后归属到账号的 UV。与概览 UV 口径一致。"""
    return uv_deduped_count_sql(where=where)


def uv_converted_sql(*, where: str = _TODAY) -> str:
    """
    当日游客→账号：同日 visit 上 user_bound_at 晚于 created_at
    （排除「首访即带账号」时 INSERT 误写的 bound_at）。
    """
    bound_day = cn_day_sql("user_bound_at")
    return f"""
        SELECT count(*) FROM daily_active_visitors
        WHERE {where}
          AND user_bound_at IS NOT NULL
          AND {bound_day} = visit_date
          AND user_bound_at > created_at
          AND {uv_attributed_where()}
    """


def uv_series_deduped_sql() -> str:
    return f"""
        SELECT visit_date::text, count(DISTINCT {UV_IDENTITY_SQL})
        FROM daily_active_visitors
        WHERE visit_date >= {CN_TODAY_SQL} - %s::int
          AND {uv_attributed_where()}
        GROUP BY visit_date
        ORDER BY visit_date
    """
