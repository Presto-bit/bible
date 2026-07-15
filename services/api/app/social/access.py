"""群角色与权限（PRODUCT §23）。"""
from __future__ import annotations

from fastapi import HTTPException

ROLES = frozenset({"owner", "admin", "member"})
STAFF = frozenset({"owner", "admin"})


def require_member(conn, gid: str, user_id: str) -> str:
    row = conn.execute(
        "SELECT role FROM group_member WHERE group_id = %s AND user_id = %s",
        (gid, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(403, "不是群成员")
    role = (row[0] or "member").strip()
    return role if role in ROLES else "member"


def require_staff(conn, gid: str, user_id: str) -> str:
    role = require_member(conn, gid, user_id)
    if role not in STAFF:
        raise HTTPException(403, "需要群主或管理员")
    return role


def require_owner(conn, gid: str, user_id: str) -> str:
    role = require_member(conn, gid, user_id)
    if role != "owner":
        raise HTTPException(403, "仅群主可操作")
    return role


def can_post_task(role: str) -> bool:
    return role in STAFF


def can_moderate_messages(role: str) -> bool:
    return role in STAFF
