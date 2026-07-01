"""社交：共读群（仅打卡/任务，不支持自由聊天）+ 好友（无私聊）。

所有接口需认证（get_current_user）。群打卡须挂经文或任务（PRODUCT 规则）。
"""
from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth.session import get_current_user
from ..db import get_pool
from .moderation import ModerationError, moderate_text

router = APIRouter(prefix="/social", tags=["social"])


# ── 模型 ──
class CreateGroup(BaseModel):
    name: str
    intro: str | None = None


class JoinGroup(BaseModel):
    join_code: str


class CreateTask(BaseModel):
    title: str
    ref: str | None = None


class Checkin(BaseModel):
    body: str | None = None
    ref: str | None = None
    task_id: str | None = None


class React(BaseModel):
    emoji: str


class Report(BaseModel):
    reason: str | None = None


class AddFriend(BaseModel):
    handle: str


# 被 N 个不同用户举报后，消息在 feed 中自动隐藏（待人工复核）。
REPORT_HIDE_THRESHOLD = 3


def _ensure_report_table(conn) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS message_report ("
        "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"
        "  message_id uuid NOT NULL,"
        "  reporter_id uuid NOT NULL,"
        "  reason text,"
        "  created_at timestamptz NOT NULL DEFAULT now(),"
        "  UNIQUE (message_id, reporter_id)"
        ")"
    )


def _gen_code() -> str:
    return secrets.token_hex(3).upper()  # 6 位十六进制


# ── 群 ──
@router.post("/groups")
def create_group(body: CreateGroup, user_id: str = Depends(get_current_user)) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "群名不能为空")
    pool = get_pool()
    with pool.connection() as conn:
        code = _gen_code()
        row = conn.execute(
            "INSERT INTO social_group (name, intro, owner_id, join_code) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (name, body.intro, user_id, code),
        ).fetchone()
        gid = row[0]
        conn.execute(
            "INSERT INTO group_member (group_id, user_id, role) VALUES (%s, %s, 'owner')",
            (gid, user_id),
        )
        conn.commit()
    return {"id": str(gid), "name": name, "join_code": code, "role": "owner"}


@router.post("/groups/join")
def join_group(body: JoinGroup, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, name FROM social_group WHERE join_code = %s",
            (body.join_code.strip().upper(),),
        ).fetchone()
        if not row:
            raise HTTPException(404, "邀请码无效")
        gid, name = row
        conn.execute(
            "INSERT INTO group_member (group_id, user_id) VALUES (%s, %s) "
            "ON CONFLICT DO NOTHING",
            (gid, user_id),
        )
        conn.commit()
    return {"id": str(gid), "name": name, "role": "member"}


@router.get("/groups")
def my_groups(user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT g.id, g.name, g.intro, g.join_code, m.role, "
            "  (SELECT count(*) FROM group_member mm WHERE mm.group_id = g.id) AS members "
            "FROM social_group g JOIN group_member m ON m.group_id = g.id "
            "WHERE m.user_id = %s ORDER BY g.created_at DESC",
            (user_id,),
        ).fetchall()
    return {
        "groups": [
            {"id": str(r[0]), "name": r[1], "intro": r[2], "join_code": r[3],
             "role": r[4], "members": r[5]}
            for r in rows
        ]
    }


def _require_member(conn, gid: str, user_id: str) -> str:
    row = conn.execute(
        "SELECT role FROM group_member WHERE group_id = %s AND user_id = %s",
        (gid, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(403, "非群成员")
    return row[0]


@router.get("/groups/{gid}")
def group_detail(gid: str, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        role = _require_member(conn, gid, user_id)
        g = conn.execute(
            "SELECT name, intro, join_code FROM social_group WHERE id = %s", (gid,)
        ).fetchone()
        if not g:
            raise HTTPException(404, "群不存在")
        members = conn.execute(
            "SELECT u.display_name, m.role FROM group_member m "
            "JOIN users u ON u.id = m.user_id WHERE m.group_id = %s", (gid,)
        ).fetchall()
        tasks = conn.execute(
            "SELECT id, title, ref FROM group_task WHERE group_id = %s ORDER BY created_at DESC",
            (gid,),
        ).fetchall()
    return {
        "id": gid, "name": g[0], "intro": g[1], "join_code": g[2], "role": role,
        "members": [{"name": m[0], "role": m[1]} for m in members],
        "tasks": [{"id": str(t[0]), "title": t[1], "ref": t[2]} for t in tasks],
    }


@router.get("/groups/{gid}/feed")
def group_feed(gid: str, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        _require_member(conn, gid, user_id)
        _ensure_report_table(conn)
        rows = conn.execute(
            "SELECT m.id, u.display_name, m.user_id, m.kind, m.ref, m.body, "
            "  m.reactions, m.created_at "
            "FROM group_message m JOIN users u ON u.id = m.user_id "
            "WHERE m.group_id = %s "
            "  AND (SELECT count(DISTINCT r.reporter_id) FROM message_report r "
            "       WHERE r.message_id = m.id) < %s "
            "ORDER BY m.created_at ASC LIMIT 200",
            (gid, REPORT_HIDE_THRESHOLD),
        ).fetchall()
    return {
        "messages": [
            {"id": str(r[0]), "author": r[1], "mine": str(r[2]) == user_id,
             "kind": r[3], "ref": r[4], "body": r[5],
             "reactions": r[6] or {}, "created_at": r[7].isoformat()}
            for r in rows
        ]
    }


@router.post("/groups/{gid}/checkin")
def checkin(gid: str, body: Checkin, user_id: str = Depends(get_current_user)) -> dict:
    if not (body.ref or body.task_id):
        raise HTTPException(400, "打卡须挂经文或任务")
    try:
        moderate_text(body.body)
    except ModerationError as e:
        raise HTTPException(400, e.reason) from e
    pool = get_pool()
    with pool.connection() as conn:
        _require_member(conn, gid, user_id)
        row = conn.execute(
            "INSERT INTO group_message (group_id, user_id, kind, ref, task_id, body) "
            "VALUES (%s, %s, 'checkin', %s, %s, %s) RETURNING id",
            (gid, user_id, body.ref, body.task_id, body.body),
        ).fetchone()
        conn.commit()
    return {"id": str(row[0])}


@router.post("/groups/{gid}/tasks")
def create_task(gid: str, body: CreateTask, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        role = _require_member(conn, gid, user_id)
        if role != "owner":
            raise HTTPException(403, "仅群主可发布任务")
        try:
            moderate_text(body.title)
        except ModerationError as e:
            raise HTTPException(400, e.reason) from e
        row = conn.execute(
            "INSERT INTO group_task (group_id, title, ref, created_by) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (gid, body.title.strip(), body.ref, user_id),
        ).fetchone()
        conn.commit()
    return {"id": str(row[0]), "title": body.title.strip(), "ref": body.ref}


@router.post("/messages/{mid}/report")
def report_message(mid: str, body: Report, user_id: str = Depends(get_current_user)) -> dict:
    """举报消息：同一用户对同一消息只计一次；达到阈值后该消息在 feed 自动隐藏。"""
    pool = get_pool()
    with pool.connection() as conn:
        msg = conn.execute(
            "SELECT group_id FROM group_message WHERE id = %s", (mid,)
        ).fetchone()
        if not msg:
            raise HTTPException(404, "消息不存在")
        _require_member(conn, str(msg[0]), user_id)
        _ensure_report_table(conn)
        conn.execute(
            "INSERT INTO message_report (message_id, reporter_id, reason) "
            "VALUES (%s, %s, %s) ON CONFLICT (message_id, reporter_id) "
            "DO UPDATE SET reason = EXCLUDED.reason",
            (mid, user_id, (body.reason or "").strip()[:500] or None),
        )
        count = conn.execute(
            "SELECT count(DISTINCT reporter_id) FROM message_report WHERE message_id = %s",
            (mid,),
        ).fetchone()[0]
        conn.commit()
    return {"ok": True, "reports": count, "hidden": count >= REPORT_HIDE_THRESHOLD}


@router.delete("/messages/{mid}")
def delete_message(mid: str, user_id: str = Depends(get_current_user)) -> dict:
    """删除消息：作者本人或群主可删。"""
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT group_id, user_id FROM group_message WHERE id = %s", (mid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "消息不存在")
        gid, author_id = str(row[0]), str(row[1])
        role = _require_member(conn, gid, user_id)
        if author_id != user_id and role != "owner":
            raise HTTPException(403, "仅作者或群主可删除")
        conn.execute("DELETE FROM group_message WHERE id = %s", (mid,))
        conn.commit()
    return {"ok": True}


@router.post("/messages/{mid}/react")
def react(mid: str, body: React, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT reactions FROM group_message WHERE id = %s", (mid,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "消息不存在")
        reactions = row[0] or {}
        users = set(reactions.get(body.emoji, []))
        if user_id in users:
            users.discard(user_id)
        else:
            users.add(user_id)
        if users:
            reactions[body.emoji] = sorted(users)
        else:
            reactions.pop(body.emoji, None)
        conn.execute(
            "UPDATE group_message SET reactions = %s::jsonb WHERE id = %s",
            (json.dumps(reactions), mid),
        )
        conn.commit()
    return {"reactions": reactions}


# ── 好友（无私聊） ──
@router.get("/me")
def me(user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT handle, display_name FROM users WHERE id = %s", (user_id,)
        ).fetchone()
    return {"user_id": user_id, "handle": row[0] if row else None,
            "display_name": row[1] if row else None}


@router.post("/friends")
def add_friend(body: AddFriend, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, display_name FROM users WHERE handle = %s", (body.handle.strip(),)
        ).fetchone()
        if not row:
            raise HTTPException(404, "用户不存在")
        fid = str(row[0])
        if fid == user_id:
            raise HTTPException(400, "不能添加自己")
        for a, b in ((user_id, fid), (fid, user_id)):
            conn.execute(
                "INSERT INTO friendship (user_id, friend_id) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (a, b),
            )
        conn.commit()
    return {"friend_id": fid, "display_name": row[1]}


@router.get("/friends")
def list_friends(user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT u.id, u.handle, u.display_name FROM friendship f "
            "JOIN users u ON u.id = f.friend_id WHERE f.user_id = %s "
            "ORDER BY f.created_at DESC",
            (user_id,),
        ).fetchall()
    return {"friends": [
        {"user_id": str(r[0]), "handle": r[1], "display_name": r[2]} for r in rows
    ]}
