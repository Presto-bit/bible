"""UV 统计 SQL 片段（V2 去重 + 看板指标）。"""
from __future__ import annotations

from ..time_cn import CN_TODAY_SQL, cn_day_sql
from .uv import UV_IDENTITY_SQL, uv_identity_sql

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


def _account_secured_sql(ac_alias: str = "ac") -> str:
    """已设密或已绑手机：计入 UV；纯静默建档（无密码无手机）视为游客设备。"""
    a = ac_alias
    return (
        f"(({a}.pwd_hash IS NOT NULL AND trim({a}.pwd_hash) <> '') "
        f"OR ({a}.phone IS NOT NULL AND trim({a}.phone) <> ''))"
    )


def uv_attributed_where(alias: str | None = None) -> str:
    """已归属「有效账号」：能解析到已设密或已绑手机的 accounts（排除游客设备 / 静默建档）。"""
    p = f"{alias}." if alias else ""
    fp = f"{alias}.device_fingerprint" if alias else "device_fingerprint"
    uid = f"{p}user_id"
    code = f"{p}user_code"
    secured = _account_secured_sql("ac")
    return f"""(
      EXISTS (
        SELECT 1 FROM accounts ac
        WHERE ac.user_id = {uid}
          AND {secured}
      )
      OR EXISTS (
        SELECT 1 FROM device_user_bindings dub
        JOIN accounts ac ON ac.user_code = dub.user_code
        WHERE dub.device_fingerprint = {fp}
          AND {secured}
      )
      OR (
        {code} IS NOT NULL
        AND trim({code}) <> ''
        AND EXISTS (
          SELECT 1 FROM accounts ac
          WHERE ac.user_code = trim({code})
            AND {secured}
        )
      )
    )"""


def uv_deduped_count_sql(*, where: str = _TODAY) -> str:
    """概览 UV：按可归并到有效账号的身份去重，不含游客设备。"""
    return f"""
        SELECT count(DISTINCT {UV_IDENTITY_SQL})
        FROM daily_active_visitors
        WHERE {where}
          AND {uv_attributed_where()}
    """


def uv_guest_rows_sql(*, where: str = _TODAY) -> str:
    """未计入概览 UV：游客设备（含静默建档未设密/未绑手机）。"""
    return f"""
        SELECT count(DISTINCT {UV_IDENTITY_SQL})
        FROM daily_active_visitors
        WHERE {where}
          AND NOT {uv_attributed_where()}
    """


def uv_login_rows_sql(*, where: str = _TODAY) -> str:
    """有效账号访问行数（未去重；与概览口径一致）。"""
    return f"""
        SELECT count(*) FROM daily_active_visitors
        WHERE {where}
          AND {uv_attributed_where()}
    """


def uv_login_users_sql(*, where: str = _TODAY) -> str:
    """当日去重后归属到有效账号的 UV。与概览 UV 口径一致。"""
    return uv_deduped_count_sql(where=where)


def uv_converted_sql(*, where: str = _TODAY) -> str:
    """当日设备绑定到有效账号（游客→登录）。"""
    bound_day = cn_day_sql("user_bound_at")
    return f"""
        SELECT count(*) FROM daily_active_visitors
        WHERE {where}
          AND user_bound_at IS NOT NULL
          AND {bound_day} = visit_date
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
