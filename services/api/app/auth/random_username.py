"""注册默认用户名：圣经正向词 前缀+后缀（PRODUCT §5.5）。"""
from __future__ import annotations

import random
import re
import secrets

PREFIXES = (
    "蒙恩",
    "喜乐",
    "平安",
    "盼望",
    "良善",
    "温柔",
    "谦卑",
    "慈爱",
    "信实",
    "忍耐",
    "感恩",
    "仰望",
    "寻道",
    "同行",
    "馨香",
)

SUFFIXES = (
    "的旅人",
    "的牧人",
    "的门徒",
    "的子民",
    "的羊群",
    "的橄榄枝",
    "的葡萄树",
    "的晨星",
    "的灯台",
    "的活水",
    "的麦田",
    "的飞鸽",
)

_USERNAME_MIN = 2
_USERNAME_MAX = 24
_GENERATED_RE = re.compile(
    r"^("
    + "|".join(re.escape(p) for p in PREFIXES)
    + r")("
    + "|".join(re.escape(s) for s in SUFFIXES)
    + r")(\d{2})?$"
)


def generate_random_username() -> str:
    return random.choice(PREFIXES) + random.choice(SUFFIXES)


def is_generated_username(name: str | None) -> bool:
    """是否为系统随机名（含撞名时追加的两位数字）。"""
    n = (name or "").strip()
    return bool(n and _GENERATED_RE.fullmatch(n))


def normalize_username(raw: str | None) -> str:
    return (raw or "").strip()


def validate_username(raw: str | None) -> str:
    """校验并规范化用户名；失败抛 ValueError。"""
    name = normalize_username(raw)
    if len(name) < _USERNAME_MIN:
        raise ValueError(f"用户名至少 {_USERNAME_MIN} 个字")
    if len(name) > _USERNAME_MAX:
        raise ValueError(f"用户名最多 {_USERNAME_MAX} 个字")
    if re.fullmatch(r"\d{8,10}", name):
        raise ValueError("用户名不能是纯数字用户 ID")
    return name


def is_username_taken(conn, name: str, *, exclude_user_code: str | None = None) -> bool:
    row = conn.execute(
        "SELECT user_code FROM accounts WHERE lower(username) = lower(%s) LIMIT 1",
        (name,),
    ).fetchone()
    if not row:
        return False
    if exclude_user_code and row[0] == exclude_user_code:
        return False
    return True


def allocate_unique_username(
    conn, *, exclude_user_code: str | None = None, max_attempts: int = 48
) -> str:
    for _ in range(max_attempts):
        name = generate_random_username()
        if not is_username_taken(conn, name, exclude_user_code=exclude_user_code):
            return name
    base = generate_random_username()
    for _ in range(100):
        suffix = secrets.randbelow(90) + 10
        candidate = f"{base}{suffix}"
        if len(candidate) <= _USERNAME_MAX and not is_username_taken(
            conn, candidate, exclude_user_code=exclude_user_code
        ):
            return candidate
    raise RuntimeError("无法分配唯一用户名")
