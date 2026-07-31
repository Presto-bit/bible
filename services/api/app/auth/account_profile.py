"""账号用户名解析与 user_profile 同步。"""
from __future__ import annotations

from fastapi import HTTPException

from .random_username import (
    allocate_unique_username,
    is_username_taken,
    validate_username,
)


def resolve_register_username(
    conn,
    *,
    user_code: str,
    requested: str | None,
) -> str | None:
    """注册/建档：有请求则校验；已有则保留；否则不自动分配（展示名由用户自设）。"""
    requested_clean = (requested or "").strip() or None
    row = conn.execute(
        "SELECT username FROM accounts WHERE user_code = %s",
        (user_code,),
    ).fetchone()
    existing = (row[0] or "").strip() if row else ""

    if requested_clean:
        try:
            name = validate_username(requested_clean)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if is_username_taken(conn, name, exclude_user_code=user_code):
            raise HTTPException(status_code=409, detail="用户名已被占用")
        return name

    if existing:
        return existing

    # 新账号：不再系统随机起名；展示用客户端占位「读经伙伴」
    return None


def upsert_user_profile(
    conn, *, user_id: str, user_code: str, username: str | None
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
        (user_id, (username or "").strip() or None, user_code),
    )


def apply_username_change(
    conn,
    *,
    user_code: str,
    user_id: str,
    requested: str | None = None,
    randomize: bool = False,
) -> str:
    """登录后改用户名：自定义或一键随机灵感；写 accounts / user_profile / users.display_name。"""
    if randomize:
        name = allocate_unique_username(conn, exclude_user_code=user_code)
    else:
        try:
            name = validate_username(requested)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if is_username_taken(conn, name, exclude_user_code=user_code):
            raise HTTPException(status_code=409, detail="用户名已被占用")

    conn.execute(
        "INSERT INTO users (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
        (user_id,),
    )
    conn.execute(
        """
        INSERT INTO accounts (user_code, user_id, username, updated_at)
        VALUES (%s, %s, %s, now())
        ON CONFLICT (user_code) DO UPDATE SET
          username = EXCLUDED.username,
          user_id = COALESCE(accounts.user_id, EXCLUDED.user_id),
          updated_at = now()
        """,
        (user_code, user_id, name),
    )
    upsert_user_profile(conn, user_id=user_id, user_code=user_code, username=name)
    conn.execute(
        """
        UPDATE users
        SET display_name = %s
        WHERE id = %s
        """,
        (name, user_id),
    )
    return name
