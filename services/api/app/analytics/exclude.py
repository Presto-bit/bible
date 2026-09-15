"""排除测试 / 冒烟 / 非真实用户，不计入 UV·注册等看板。

口径：
- 发版冒烟固定账号 99990001、release-smoke* 设备
- 环境变量 ANALYTICS_EXCLUDE_USER_CODES（逗号分隔）可追加
- 本机 / 内网探测 IP 伪设备（ip:127.* 等）
"""
from __future__ import annotations

from functools import lru_cache

# release.sh 鉴权冒烟固定码
_DEFAULT_EXCLUDE_USER_CODES = frozenset({"99990001"})

_DEVICE_PREFIX_RE = (
    r"^(release-smoke|hijack-release-smoke|smoke-|test-device-|testclient)"
)
_LOCAL_IP_RE = r"^ip:(127\.|::1|0\.0\.0\.0|localhost|testclient)"


@lru_cache(maxsize=1)
def excluded_user_codes() -> frozenset[str]:
    codes = set(_DEFAULT_EXCLUDE_USER_CODES)
    try:
        from ..config import get_settings

        raw = (get_settings().analytics_exclude_user_codes or "").strip()
    except Exception:
        raw = ""
    for part in raw.split(","):
        c = part.strip()
        if c:
            codes.add(c)
    return frozenset(codes)


def clear_exclude_cache() -> None:
    excluded_user_codes.cache_clear()


def is_excluded_user_code(user_code: str | None) -> bool:
    code = (user_code or "").strip()
    if not code:
        return False
    return code in excluded_user_codes()


def is_excluded_device_id(device_id: str | None) -> bool:
    device = (device_id or "").strip().lower()
    if not device:
        return False
    import re

    if re.match(_DEVICE_PREFIX_RE, device, re.IGNORECASE):
        return True
    if re.match(_LOCAL_IP_RE, device, re.IGNORECASE):
        return True
    return False


def should_exclude_visit(
    *,
    user_code: str | None = None,
    device_id: str | None = None,
) -> bool:
    return is_excluded_user_code(user_code) or is_excluded_device_id(device_id)


def _sql_string_list(values: frozenset[str]) -> str:
    if not values:
        return "'__analytics_exclude_none__'"
    return ", ".join("'" + v.replace("'", "''") + "'" for v in sorted(values))


def uv_not_excluded_sql(alias: str | None = None) -> str:
    """daily_active_visitors 行过滤：排除冒烟设备与排除名单 user_code。"""
    from .uv import uv_identity_sql

    p = f"{alias}." if alias else ""
    fp = f"{p}device_fingerprint"
    code_col = f"{p}user_code"
    identity = uv_identity_sql(alias)
    codes = _sql_string_list(excluded_user_codes())
    return f"""(
      COALESCE({identity}, nullif(trim({code_col}), '')) NOT IN ({codes})
      AND COALESCE({fp}, '') !~* '{_DEVICE_PREFIX_RE}'
      AND COALESCE({fp}, '') !~* '{_LOCAL_IP_RE}'
    )"""


def users_not_excluded_sql(user_alias: str = "u") -> str:
    """users 行过滤：账号码在排除名单，或仅绑过冒烟设备。"""
    codes = _sql_string_list(excluded_user_codes())
    return f"""(
      NOT EXISTS (
        SELECT 1 FROM accounts _ax
        WHERE _ax.user_id = {user_alias}.id
          AND _ax.user_code IN ({codes})
      )
      AND NOT EXISTS (
        SELECT 1
        FROM accounts _ay
        JOIN device_user_bindings _db ON _db.user_code = _ay.user_code
        WHERE _ay.user_id = {user_alias}.id
          AND _db.device_fingerprint ~* '{_DEVICE_PREFIX_RE}'
      )
    )"""


def accounts_not_excluded_sql(account_alias: str = "a") -> str:
    codes = _sql_string_list(excluded_user_codes())
    return f"""(
      {account_alias}.user_code NOT IN ({codes})
      AND NOT EXISTS (
        SELECT 1 FROM device_user_bindings _db
        WHERE _db.user_code = {account_alias}.user_code
          AND _db.device_fingerprint ~* '{_DEVICE_PREFIX_RE}'
      )
    )"""
