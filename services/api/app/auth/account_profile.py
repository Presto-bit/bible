"""账号用户名解析与 user_profile 同步。"""
from __future__ import annotations

from fastapi import HTTPException

from .random_username import allocate_unique_username


def resolve_register_username(
    conn,
    *,
    user_code: str,
    requested: str | None,
) -> str:
    """注册/建档：客户端未传用户名时为首次账号分配随机名，已有则保留。"""
    requested_clean = (requested or "").strip() or None
    row = conn.execute(
        "SELECT username FROM accounts WHERE user_code = %s",
        (user_code,),
    ).fetchone()
    existing = (row[0] or "").strip() if row else ""

    if requested_clean:
        taken = conn.execute(
            "SELECT user_code FROM accounts WHERE lower(username) = lower(%s)",
            (requested_clean,),
        ).fetchone()
        if taken and taken[0] != user_code:
            raise HTTPException(status_code=409, detail="用户名已被占用")
        return requested_clean

    if existing:
        return existing

    return allocate_unique_username(conn, exclude_user_code=user_code)


def upsert_user_profile(
    conn, *, user_id: str, user_code: str, username: str
) -> None:
    conn.execute(
        """
        INSERT INTO user_profile (user_id, username, user_code, updated_at)
        VALUES (%s, %s, %s, now())
        ON CONFLICT (user_id) DO UPDATE SET
          username = EXCLUDED.username,
          user_code = EXCLUDED.user_code,
          updated_at = now()
        """,
        (user_id, username, user_code),
    )
