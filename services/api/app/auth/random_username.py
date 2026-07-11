"""注册默认用户名：圣经正向词 前缀+后缀（PRODUCT §5.5）。"""
from __future__ import annotations

import random
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


def generate_random_username() -> str:
    return random.choice(PREFIXES) + random.choice(SUFFIXES)


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
        if len(candidate) <= 24 and not is_username_taken(
            conn, candidate, exclude_user_code=exclude_user_code
        ):
            return candidate
    raise RuntimeError("无法分配唯一用户名")
