"""社交 IM v1.2：会话列表、好友申请、单聊、群闲聊、会话状态、撤回、清理入口。"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from ..auth.session import get_current_user
from ..auth.user_code import pick_user_code, uuid_for_code
from ..config import get_settings
from ..db import get_pool
from . import access
from .im_schema import ensure_social_im_v12, ensure_social_im_v12_pool
from .blob_store import get_blob_store, normalize_object_key
from .media import build_attachment_row, unlink_storage_keys
from .preview import convert_office_to_pdf, needs_server_pdf_preview
from .moderation import ModerationError, moderate_text

import asyncio
import json as _json_mod
import threading
import time

router = APIRouter(prefix="/social", tags=["social-im"])

_MSG_RETENTION = timedelta(days=30)
_RECALL_WINDOW = timedelta(minutes=2)

# realtime_cursor 短缓存：多 SSE / 多页同时订阅时合并探测
_cursor_cache: dict[str, tuple[float, dict]] = {}
_CURSOR_TTL_SEC = 2.5
_cursor_lock = threading.Lock()

_FILE_EXT = frozenset({
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
})
_IMAGE_EXT = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp"})


def _retention_cutoff() -> datetime:
    return datetime.now(timezone.utc) - _MSG_RETENTION


def _pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def _display(conn, uid: str) -> str:
    try:
        row = conn.execute(
            """
            SELECT COALESCE(
              NULLIF(TRIM(up.username), ''),
              CASE WHEN COALESCE(TRIM(u.display_name), '')
                ~ '^(用户[0-9A-Fa-f]{4,}|读经伙伴|群友|书友|[0-9]{8,10})$' THEN NULL
              ELSE NULLIF(TRIM(u.display_name), '') END,
              NULLIF(TRIM(u.handle), ''),
              NULLIF(TRIM(ac.username), '')
            )
            FROM users u
            LEFT JOIN user_profile up ON up.user_id = u.id
            LEFT JOIN accounts ac ON ac.user_id = u.id
            WHERE u.id = %s
            """,
            (uid,),
        ).fetchone()
        name = (row[0] if row else None) or ""
        if name.strip():
            return name.strip()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        row = conn.execute(
            "SELECT COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(handle), ''), %s) "
            "FROM users WHERE id = %s",
            (f"用户{uid[:4]}", uid),
        ).fetchone()
        return (row[0] if row else f"用户{uid[:4]}") or f"用户{uid[:4]}"
    return f"用户{uid[:4]}"


def _displays(conn, uids: list[str]) -> dict[str, str]:
    """批量取展示名，避免会话列表 N+1。"""
    out: dict[str, str] = {}
    uniq = [u for u in dict.fromkeys(uids) if u]
    if not uniq:
        return out
    try:
        rows = conn.execute(
            """
            SELECT u.id::text,
              COALESCE(
                NULLIF(TRIM(up.username), ''),
                CASE WHEN COALESCE(TRIM(u.display_name), '')
                  ~ '^(用户[0-9A-Fa-f]{4,}|读经伙伴|群友|书友|[0-9]{8,10})$' THEN NULL
                ELSE NULLIF(TRIM(u.display_name), '') END,
                NULLIF(TRIM(u.handle), ''),
                NULLIF(TRIM(ac.username), '')
              )
            FROM users u
            LEFT JOIN user_profile up ON up.user_id = u.id
            LEFT JOIN accounts ac ON ac.user_id = u.id
            WHERE u.id = ANY(%s::uuid[])
            """,
            (uniq,),
        ).fetchall()
        for rid, name in rows:
            out[str(rid)] = (name or "").strip() or f"用户{str(rid)[:4]}"
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        try:
            rows = conn.execute(
                """
                SELECT id::text,
                  COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(handle), ''), '')
                FROM users WHERE id = ANY(%s::uuid[])
                """,
                (uniq,),
            ).fetchall()
            for rid, name in rows:
                out[str(rid)] = (name or "").strip() or f"用户{str(rid)[:4]}"
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
    for u in uniq:
        out.setdefault(u, f"用户{u[:4]}")
    return out


def _peer_avatars(conn, uids: list[str]) -> dict[str, str | None]:
    out: dict[str, str | None] = {}
    uniq = [u for u in dict.fromkeys(uids) if u]
    if not uniq:
        return out
    try:
        rows = conn.execute(
            "SELECT user_id::text, avatar_id FROM user_profile WHERE user_id = ANY(%s::uuid[])",
            (uniq,),
        ).fetchall()
        for rid, aid in rows:
            out[str(rid)] = aid
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
    for u in uniq:
        out.setdefault(u, None)
    return out


def _attachment_names(conn, scope: str, message_ids: list) -> dict[str, str]:
    """批量取附件名。"""
    out: dict[str, str] = {}
    ids = [str(m) for m in message_ids if m]
    if not ids:
        return out
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT ON (message_id) message_id::text, file_name
            FROM message_attachment
            WHERE scope = %s AND message_id = ANY(%s::uuid[])
            ORDER BY message_id, created_at ASC
            """,
            (scope, ids),
        ).fetchall()
        for mid, fname in rows:
            if fname:
                out[str(mid)] = str(fname)
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
    return out


def _summarize(kind: str | None, body: str | None, file_name: str | None = None) -> str:
    k = (kind or "chat").lower()
    b = (body or "").strip().replace("\n", " ")
    if k == "checkin":
        return f"[打卡] {b[:48]}" if b else "[打卡]"
    if k == "task":
        return f"[任务] {b[:48]}" if b else "[任务]"
    if k == "plan":
        return f"[计划] {b[:48]}" if b else "[计划]"
    if k == "verse":
        return f"[经文] {b[:48]}" if b else "[经文]"
    if k == "image":
        return f"[图片] {b[:40]}" if b else "[图片]"
    if k == "file":
        name = (file_name or "").strip()
        if name and b:
            return f"[文件] {name}"
        if name:
            return f"[文件] {name}"
        return f"[文件] {b[:40]}" if b else "[文件]"
    if k == "system":
        return b[:60] or "[系统]"
    if b.startswith("回复 ") or "┃" in b:
        return b[:80]
    return b[:80] if b else "[消息]"


def _conv_preview(
    *,
    kind: str | None,
    body: str | None,
    file_name: str | None,
    scope: str,
    viewer_id: str,
    sender_id: str | None = None,
    author_name: str | None = None,
) -> str | None:
    """会话列表末条预览（微信式：群聊带发送人）。"""
    preview = _summarize(kind, body, file_name)
    if not preview:
        return None
    k = (kind or "chat").lower()
    if scope == "group" and k != "system" and sender_id:
        if str(sender_id) == viewer_id:
            return f"我: {preview}"
        name = (author_name or "").strip() or "群友"
        if re.match(r"^用户[0-9a-fA-F]{4,}$", name):
            name = "群友"
        return f"{name}: {preview}"
    return preview


def _ensure_im_tables(conn) -> None:
    ensure_social_im_v12(conn)


# ── 模型 ──
class FriendRequestIn(BaseModel):
    handle: str
    message: str | None = Field(default=None, max_length=120)


class ChatIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    reply_to_id: str | None = None
    mentions: list[str] = Field(default_factory=list, max_length=20)


class DmIn(BaseModel):
    body: str | None = Field(default=None, max_length=2000)
    kind: str = "chat"
    ref: str | None = None
    reply_to_id: str | None = None


class ConversationStateIn(BaseModel):
    last_read_at: str | None = None
    pinned: bool | None = None
    muted: bool | None = None
    # True=从消息列表移除（有新消息后自动再出现）；False=取消隐藏
    hidden: bool | None = None


class SetAdminsIn(BaseModel):
    user_ids: list[str] = Field(default_factory=list, max_length=5)


class AllowChatIn(BaseModel):
    allow_chat: bool


class ReportIn(BaseModel):
    target_type: str = "group_message"
    target_id: str
    reason: str = "other"


# ── 会话列表 ──
@router.get("/conversations")
def list_conversations(user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    cutoff = _retention_cutoff()
    items: list[dict] = []
    # 独立连接补 schema，避免失败污染本请求事务（已就绪时零开销）
    ensure_social_im_v12_pool(pool)
    with pool.connection() as conn:
        # 好友申请 inbox（021 未迁移时降级）
        try:
            pending_fr = conn.execute(
                "SELECT count(*)::int FROM friend_request "
                "WHERE to_user_id = %s AND status = 'pending'",
                (user_id,),
            ).fetchone()[0]
        except Exception:
            conn.rollback()
            pending_fr = 0
        if pending_fr:
            items.append({
                "scope": "inbox_friends",
                "ref_id": "friends",
                "title": "新的朋友",
                "subtitle": f"{pending_fr} 条待处理申请",
                "unread": pending_fr,
                "updated_at": None,
                "pinned": True,
                "muted": False,
                "badge": None,
            })

        # 群邀请 inbox（沿用 group_invite）
        try:
            pending_gi = conn.execute(
                "SELECT count(*)::int FROM group_invite "
                "WHERE invitee_id = %s AND status = 'pending'",
                (user_id,),
            ).fetchone()[0]
        except Exception:
            conn.rollback()
            pending_gi = 0
        if pending_gi:
            items.append({
                "scope": "inbox_groups",
                "ref_id": "groups",
                "title": "群通知",
                "subtitle": f"{pending_gi} 条入群邀请",
                "unread": pending_gi,
                "updated_at": None,
                "pinned": True,
                "muted": False,
                "badge": None,
            })

        groups = []
        # 末条预览不按 retention 截断（清理任务负责删旧消息）；unread 仍用 cutoff
        try:
            groups = conn.execute(
                """
                SELECT g.id, g.name, m.role,
                  lm.id AS last_id, lm.kind AS last_kind, lm.body AS last_body,
                  lm.created_at AS last_at, lm.user_id AS last_uid, lm.author_name,
                  cs.pinned_at, COALESCE(cs.muted, false) AS muted,
                  (
                    SELECT count(*)::int FROM (
                      SELECT 1 FROM group_message gm
                      WHERE gm.group_id = g.id
                        AND gm.recalled_at IS NULL
                        AND gm.created_at >= %s
                        AND gm.created_at > COALESCE(cs.last_read_at, '-infinity'::timestamptz)
                        AND gm.user_id <> %s
                      LIMIT 100
                    ) u
                  ) AS unread,
                  g.created_at AS group_created_at
                FROM social_group g
                JOIN group_member m ON m.group_id = g.id AND m.user_id = %s
                LEFT JOIN conversation_state cs
                  ON cs.user_id = %s AND cs.scope = 'group' AND cs.ref_id = g.id::text
                LEFT JOIN LATERAL (
                  SELECT gm.id, gm.kind, gm.body, gm.created_at, gm.user_id,
                    COALESCE(
                      NULLIF(TRIM(mb.display_name), ''),
                      CASE WHEN COALESCE(TRIM(u.display_name), '') ~ '^用户[0-9A-Fa-f]{4,}$' THEN NULL
                           ELSE NULLIF(TRIM(u.display_name), '') END,
                      NULLIF(TRIM(u.handle), ''),
                      ''
                    ) AS author_name
                  FROM group_message gm
                  LEFT JOIN group_member mb
                    ON mb.group_id = gm.group_id AND mb.user_id = gm.user_id
                  LEFT JOIN users u ON u.id = gm.user_id
                  WHERE gm.group_id = g.id
                    AND gm.recalled_at IS NULL
                  ORDER BY gm.created_at DESC
                  LIMIT 1
                ) lm ON true
                WHERE cs.hidden_at IS NULL
                   OR (lm.created_at IS NOT NULL AND lm.created_at > cs.hidden_at)
                ORDER BY cs.pinned_at DESC NULLS LAST,
                         COALESCE(lm.created_at, g.created_at) DESC
                """,
                (cutoff, user_id, user_id, user_id),
            ).fetchall()
        except Exception:
            conn.rollback()
            try:
                groups = conn.execute(
                    """
                    SELECT g.id, g.name, m.role,
                      lm.id, lm.kind, lm.body, lm.created_at, lm.user_id, lm.author_name,
                      NULL::timestamptz, false, 0, g.created_at
                    FROM social_group g
                    JOIN group_member m ON m.group_id = g.id AND m.user_id = %s
                    LEFT JOIN LATERAL (
                      SELECT gm.id, gm.kind, gm.body, gm.created_at, gm.user_id,
                        COALESCE(
                          NULLIF(TRIM(u.display_name), ''),
                          NULLIF(TRIM(u.handle), ''),
                          ''
                        ) AS author_name
                      FROM group_message gm
                      LEFT JOIN users u ON u.id = gm.user_id
                      WHERE gm.group_id = g.id
                      ORDER BY gm.created_at DESC
                      LIMIT 1
                    ) lm ON true
                    ORDER BY COALESCE(lm.created_at, g.created_at) DESC
                    """,
                    (user_id,),
                ).fetchall()
            except Exception:
                conn.rollback()
                groups = []

        group_attach_ids = [
            r[3] for r in groups
            if r[3] and (r[4] or "") in ("file", "image")
        ]
        group_fnames = _attachment_names(conn, "group", group_attach_ids)

        for r in groups:
            try:
                (
                    gid, name, role, last_id, last_kind, last_body, last_at,
                    last_uid, author_name, pinned_at, muted, unread, group_created,
                ) = r
                fname = group_fnames.get(str(last_id)) if last_id else None
                sort_at = last_at or group_created
                items.append({
                    "scope": "group",
                    "ref_id": str(gid),
                    "title": name,
                    "subtitle": _conv_preview(
                        kind=last_kind,
                        body=last_body,
                        file_name=fname,
                        scope="group",
                        viewer_id=user_id,
                        sender_id=str(last_uid) if last_uid else None,
                        author_name=author_name,
                    ) if last_id else None,
                    "unread": int(unread or 0),
                    "updated_at": sort_at.isoformat() if sort_at else None,
                    "pinned": pinned_at is not None,
                    "muted": bool(muted),
                    "badge": None,
                    "role": role,
                })
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                continue

        # DM threads
        try:
            threads = conn.execute(
                """
                SELECT t.id, t.user_low_id, t.user_high_id,
                  lm.id, lm.kind, lm.body, lm.created_at,
                  cs.pinned_at, COALESCE(cs.muted, false),
                  (
                    SELECT count(*)::int FROM (
                      SELECT 1 FROM direct_message dm
                      WHERE dm.thread_id = t.id
                        AND dm.recalled_at IS NULL
                        AND dm.created_at >= %s
                        AND dm.created_at > COALESCE(cs.last_read_at, '-infinity'::timestamptz)
                        AND dm.sender_id <> %s
                      LIMIT 100
                    ) u
                  ) AS unread
                FROM direct_thread t
                LEFT JOIN conversation_state cs
                  ON cs.user_id = %s AND cs.scope = 'dm' AND cs.ref_id = t.id::text
                LEFT JOIN LATERAL (
                  SELECT dm.id, dm.kind, dm.body, dm.created_at
                  FROM direct_message dm
                  WHERE dm.thread_id = t.id
                    AND dm.recalled_at IS NULL
                  ORDER BY dm.created_at DESC
                  LIMIT 1
                ) lm ON true
                WHERE (t.user_low_id = %s OR t.user_high_id = %s)
                  AND (
                    cs.hidden_at IS NULL
                    OR (lm.created_at IS NOT NULL AND lm.created_at > cs.hidden_at)
                  )
                """,
                (cutoff, user_id, user_id, user_id, user_id),
            ).fetchall()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            threads = []

        peers: list[str] = []
        dm_attach_ids = []
        parsed_threads: list[tuple] = []
        for r in threads:
            try:
                tid, low, high, last_id, last_kind, last_body, last_at, pinned_at, muted, unread = r
                peer = str(high) if str(low) == user_id else str(low)
                peers.append(peer)
                if last_id and (last_kind or "") in ("file", "image"):
                    dm_attach_ids.append(last_id)
                parsed_threads.append(
                    (tid, peer, last_id, last_kind, last_body, last_at, pinned_at, muted, unread)
                )
            except Exception:
                continue

        peer_names = _displays(conn, peers)
        peer_avatars = _peer_avatars(conn, peers)
        dm_fnames = _attachment_names(conn, "dm", dm_attach_ids)

        for tid, peer, last_id, last_kind, last_body, last_at, pinned_at, muted, unread in parsed_threads:
            try:
                fname = dm_fnames.get(str(last_id)) if last_id else None
                items.append({
                    "scope": "dm",
                    "ref_id": str(tid),
                    "peer_user_id": peer,
                    "peer_avatar_id": peer_avatars.get(peer),
                    "title": peer_names.get(peer) or f"用户{peer[:4]}",
                    "subtitle": _conv_preview(
                        kind=last_kind,
                        body=last_body,
                        file_name=fname,
                        scope="dm",
                        viewer_id=user_id,
                    ) if last_id else None,
                    "unread": int(unread or 0),
                    "updated_at": last_at.isoformat() if last_at else None,
                    "pinned": pinned_at is not None,
                    "muted": bool(muted),
                    "badge": None,
                })
            except Exception:
                continue

    # inbox 置顶；其余置顶优先再按时间
    inbox = [i for i in items if i["scope"].startswith("inbox")]
    rest = [i for i in items if not i["scope"].startswith("inbox")]
    pinned = [i for i in rest if i.get("pinned")]
    unpinned = [i for i in rest if not i.get("pinned")]
    pinned.sort(key=lambda it: it.get("updated_at") or "", reverse=True)
    unpinned.sort(key=lambda it: it.get("updated_at") or "", reverse=True)
    return {"items": inbox + pinned + unpinned}


# ── 会话状态 ──
@router.patch("/conversations/{scope}/{ref_id}/state")
def patch_conversation_state(
    scope: str,
    ref_id: str,
    body: ConversationStateIn,
    user_id: str = Depends(get_current_user),
) -> dict:
    if scope not in ("group", "dm", "inbox_friends", "inbox_groups"):
        raise HTTPException(400, "无效 scope")
    pool = get_pool()
    ensure_social_im_v12_pool(pool)
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT last_read_at, pinned_at, muted, hidden_at FROM conversation_state "
            "WHERE user_id = %s AND scope = %s AND ref_id = %s",
            (user_id, scope, ref_id),
        ).fetchone()
        last_read = row[0] if row else None
        pinned_at = row[1] if row else None
        muted = bool(row[2]) if row else False
        hidden_at = row[3] if row else None
        if body.last_read_at:
            last_read = datetime.fromisoformat(body.last_read_at.replace("Z", "+00:00"))
        elif body.last_read_at is None and row is None:
            last_read = datetime.now(timezone.utc)
        if body.pinned is True:
            pinned_at = datetime.now(timezone.utc)
        elif body.pinned is False:
            pinned_at = None
        if body.muted is not None:
            muted = body.muted
        if body.hidden is True:
            hidden_at = datetime.now(timezone.utc)
            pinned_at = None  # 从列表移除时取消置顶
        elif body.hidden is False:
            hidden_at = None
        if (
            body.last_read_at is None
            and body.pinned is None
            and body.muted is None
            and body.hidden is None
        ):
            last_read = datetime.now(timezone.utc)
        conn.execute(
            """
            INSERT INTO conversation_state (
              user_id, scope, ref_id, last_read_at, pinned_at, muted, hidden_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (user_id, scope, ref_id) DO UPDATE SET
              last_read_at = COALESCE(EXCLUDED.last_read_at, conversation_state.last_read_at),
              pinned_at = EXCLUDED.pinned_at,
              muted = EXCLUDED.muted,
              hidden_at = EXCLUDED.hidden_at,
              updated_at = now()
            """,
            (user_id, scope, ref_id, last_read, pinned_at, muted, hidden_at),
        )
        conn.commit()
    return {"ok": True}


# ── 好友申请 ──
@router.post("/friend-requests")
def create_friend_request(
    body: FriendRequestIn, user_id: str = Depends(get_current_user),
) -> dict:
    key = body.handle.strip()
    msg = (body.message or "").strip() or None
    if msg:
        try:
            moderate_text(msg)
        except ModerationError as e:
            raise HTTPException(400, e.reason) from e
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, display_name, handle FROM users WHERE handle = %s", (key,),
        ).fetchone()
        if not row and pick_user_code(key):
            uid = uuid_for_code(key)
            row = conn.execute(
                "SELECT id, display_name, handle FROM users WHERE id = %s", (uid,),
            ).fetchone()
        if not row:
            raise HTTPException(404, "用户不存在")
        fid = str(row[0])
        if fid == user_id:
            raise HTTPException(400, "不能添加自己")
        existing = conn.execute(
            "SELECT 1 FROM friendship WHERE user_id = %s AND friend_id = %s",
            (user_id, fid),
        ).fetchone()
        if existing:
            raise HTTPException(400, "已经是好友")
        pending = conn.execute(
            "SELECT id FROM friend_request WHERE from_user_id = %s AND to_user_id = %s "
            "AND status = 'pending'",
            (user_id, fid),
        ).fetchone()
        if pending:
            return {"id": str(pending[0]), "status": "pending", "to_user_id": fid}
        # 对方已申请我 → 直接同意
        reverse = conn.execute(
            "SELECT id FROM friend_request WHERE from_user_id = %s AND to_user_id = %s "
            "AND status = 'pending'",
            (fid, user_id),
        ).fetchone()
        if reverse:
            _accept_friend_request(conn, str(reverse[0]), user_id)
            conn.commit()
            return {"id": str(reverse[0]), "status": "accepted", "to_user_id": fid}
        ins = conn.execute(
            "INSERT INTO friend_request (from_user_id, to_user_id, message) "
            "VALUES (%s, %s, %s) RETURNING id",
            (user_id, fid, msg),
        ).fetchone()
        conn.commit()
    return {"id": str(ins[0]), "status": "pending", "to_user_id": fid}


def _accept_friend_request(conn, request_id: str, actor_id: str) -> tuple[str, str]:
    row = conn.execute(
        "SELECT from_user_id, to_user_id, status FROM friend_request WHERE id = %s",
        (request_id,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "申请不存在")
    frm, to, status = str(row[0]), str(row[1]), row[2]
    if to != actor_id:
        raise HTTPException(403, "只能处理发给自己的申请")
    if status != "pending":
        raise HTTPException(400, "申请已处理")
    for a, b in ((frm, to), (to, frm)):
        conn.execute(
            "INSERT INTO friendship (user_id, friend_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (a, b),
        )
    conn.execute(
        "UPDATE friend_request SET status = 'accepted', resolved_at = now() WHERE id = %s",
        (request_id,),
    )
    return frm, to


@router.get("/friend-requests")
def list_friend_requests(user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    try:
        with pool.connection() as conn:
            incoming = conn.execute(
                """
                SELECT r.id, r.from_user_id, r.message, r.created_at, u.handle, u.display_name,
                       COALESCE(ac.user_code, up.user_code) AS peer_code
                FROM friend_request r
                JOIN users u ON u.id = r.from_user_id
                LEFT JOIN accounts ac ON ac.user_id = r.from_user_id
                LEFT JOIN user_profile up ON up.user_id = r.from_user_id
                WHERE r.to_user_id = %s AND r.status = 'pending'
                ORDER BY r.created_at DESC
                """,
                (user_id,),
            ).fetchall()
            outgoing = conn.execute(
                """
                SELECT r.id, r.to_user_id, r.message, r.created_at, r.status,
                       u.handle, u.display_name,
                       COALESCE(ac.user_code, up.user_code) AS peer_code
                FROM friend_request r
                JOIN users u ON u.id = r.to_user_id
                LEFT JOIN accounts ac ON ac.user_id = r.to_user_id
                LEFT JOIN user_profile up ON up.user_id = r.to_user_id
                WHERE r.from_user_id = %s AND r.status = 'pending'
                ORDER BY r.created_at DESC
                """,
                (user_id,),
            ).fetchall()
    except Exception:
        # 021 未迁移时表不存在：好友列表仍可用
        return {"incoming": [], "outgoing": []}
    return {
        "incoming": [
            {
                "id": str(r[0]),
                "from_user_id": str(r[1]),
                "message": r[2],
                "created_at": r[3].isoformat() if r[3] else None,
                "handle": r[4],
                "display_name": r[5],
                "user_code": str(r[6]) if r[6] else None,
            }
            for r in incoming
        ],
        "outgoing": [
            {
                "id": str(r[0]),
                "to_user_id": str(r[1]),
                "message": r[2],
                "created_at": r[3].isoformat() if r[3] else None,
                "status": r[4],
                "handle": r[5],
                "display_name": r[6],
                "user_code": str(r[7]) if r[7] else None,
            }
            for r in outgoing
        ],
    }


@router.post("/friend-requests/{rid}/accept")
def accept_friend_request(rid: str, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        frm, to = _accept_friend_request(conn, rid, user_id)
        conn.commit()
    return {"ok": True, "friend_id": frm}


@router.post("/friend-requests/{rid}/decline")
def decline_friend_request(rid: str, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT to_user_id, status FROM friend_request WHERE id = %s", (rid,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "申请不存在")
        if str(row[0]) != user_id:
            raise HTTPException(403, "只能处理发给自己的申请")
        if row[1] != "pending":
            raise HTTPException(400, "申请已处理")
        conn.execute(
            "UPDATE friend_request SET status = 'declined', resolved_at = now() WHERE id = %s",
            (rid,),
        )
        conn.commit()
    return {"ok": True}


# ── 单聊 ──
def _get_or_create_thread(conn, user_id: str, peer_id: str) -> str:
    low, high = _pair(user_id, peer_id)
    row = conn.execute(
        "SELECT id FROM direct_thread WHERE user_low_id = %s AND user_high_id = %s",
        (low, high),
    ).fetchone()
    if row:
        return str(row[0])
    row = conn.execute(
        "INSERT INTO direct_thread (user_low_id, user_high_id) VALUES (%s, %s) RETURNING id",
        (low, high),
    ).fetchone()
    return str(row[0])


@router.post("/dm/with/{peer_id}")
def open_dm(peer_id: str, user_id: str = Depends(get_current_user)) -> dict:
    peer_id = peer_id.strip()
    if peer_id == user_id:
        raise HTTPException(400, "不能与自己私信")
    pool = get_pool()
    with pool.connection() as conn:
        _ensure_im_tables(conn)
        fr = conn.execute(
            "SELECT 1 FROM friendship WHERE user_id = %s AND friend_id = %s",
            (user_id, peer_id),
        ).fetchone()
        if not fr:
            raise HTTPException(403, "仅好友可私信")
        tid = _get_or_create_thread(conn, user_id, peer_id)
        conn.commit()
    return {"thread_id": tid, "peer_user_id": peer_id}


@router.get("/dm/{thread_id}/messages")
def list_dm_messages(
    thread_id: str,
    user_id: str = Depends(get_current_user),
    limit: int = 50,
    before: str | None = None,
) -> dict:
    limit = max(1, min(limit, 100))
    cutoff = _retention_cutoff()
    pool = get_pool()
    ensure_social_im_v12_pool(pool)
    with pool.connection() as conn:
        t = conn.execute(
            "SELECT user_low_id, user_high_id FROM direct_thread WHERE id = %s",
            (thread_id,),
        ).fetchone()
        if not t or user_id not in (str(t[0]), str(t[1])):
            raise HTTPException(404, "会话不存在")
        try:
            if before:
                rows = conn.execute(
                    """
                    SELECT id, sender_id, kind, body, ref, reply_to_id, recalled_at,
                           created_at, reactions
                    FROM direct_message
                    WHERE thread_id = %s AND created_at >= %s
                      AND created_at < %s::timestamptz
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (thread_id, cutoff, before, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, sender_id, kind, body, ref, reply_to_id, recalled_at,
                           created_at, reactions
                    FROM direct_message
                    WHERE thread_id = %s AND created_at >= %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (thread_id, cutoff, limit),
                ).fetchall()
        except Exception:
            conn.rollback()
            if before:
                rows = conn.execute(
                    """
                    SELECT id, sender_id, kind, body, ref, reply_to_id, recalled_at, created_at
                    FROM direct_message
                    WHERE thread_id = %s AND created_at >= %s
                      AND created_at < %s::timestamptz
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (thread_id, cutoff, before, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, sender_id, kind, body, ref, reply_to_id, recalled_at, created_at
                    FROM direct_message
                    WHERE thread_id = %s AND created_at >= %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (thread_id, cutoff, limit),
                ).fetchall()
            rows = [(*r, {}) for r in rows]
        has_more = False
        if rows:
            oldest_ts = rows[-1][7]
            has_more = conn.execute(
                "SELECT 1 FROM direct_message WHERE thread_id = %s "
                "AND created_at >= %s AND created_at < %s LIMIT 1",
                (thread_id, cutoff, oldest_ts),
            ).fetchone() is not None
        rows = list(reversed(rows))
        mids = [str(r[0]) for r in rows]
        att_map: dict[str, list] = {mid: [] for mid in mids}
        if mids:
            try:
                for a in conn.execute(
                    "SELECT message_id::text, id, file_name, mime, size_bytes, storage_key "
                    "FROM message_attachment "
                    "WHERE scope = 'dm' AND message_id = ANY(%s::uuid[]) "
                    "ORDER BY created_at ASC",
                    (mids,),
                ).fetchall():
                    att_map.setdefault(a[0], []).append(
                        build_attachment_row(
                            storage_key=a[5],
                            file_name=a[2],
                            mime=a[3],
                            size_bytes=a[4],
                            att_id=str(a[1]),
                        ),
                    )
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
        msgs = []
        for r in rows:
            recalled = r[6] is not None
            mid = str(r[0])
            reactions = r[8] if len(r) > 8 and isinstance(r[8], dict) else {}
            msgs.append({
                "id": mid,
                "sender_id": str(r[1]),
                "kind": r[2],
                "body": None if recalled else r[3],
                "ref": None if recalled else r[4],
                "reply_to_id": str(r[5]) if r[5] else None,
                "recalled": recalled,
                "created_at": r[7].isoformat() if r[7] else None,
                "attachments": att_map.get(mid) or [],
                "mine": str(r[1]) == user_id,
                "reactions": reactions or {},
            })
        peer = str(t[1]) if str(t[0]) == user_id else str(t[0])
        peer_title = _display(conn, peer)
        peer_read = None
        try:
            pr = conn.execute(
                "SELECT last_read_at FROM conversation_state "
                "WHERE user_id = %s AND scope = 'dm' AND ref_id = %s",
                (peer, thread_id),
            ).fetchone()
            if pr and pr[0]:
                peer_read = pr[0].isoformat()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            peer_read = None
    return {
        "messages": msgs,
        "has_more": has_more,
        "peer_last_read_at": peer_read,
        "peer_user_id": peer,
        "peer_title": peer_title,
    }


@router.post("/dm/{thread_id}/messages")
def send_dm(
    thread_id: str, body: DmIn, user_id: str = Depends(get_current_user),
) -> dict:
    kind = (body.kind or "chat").lower()
    if kind not in ("chat", "verse", "image", "file"):
        raise HTTPException(400, "不支持的消息类型")
    text = (body.body or "").strip()
    if kind in ("chat", "verse") and not text and not body.ref:
        raise HTTPException(400, "内容不能为空")
    if text:
        try:
            moderate_text(text)
        except ModerationError as e:
            raise HTTPException(400, e.reason) from e
    pool = get_pool()
    with pool.connection() as conn:
        _ensure_im_tables(conn)
        t = conn.execute(
            "SELECT user_low_id, user_high_id FROM direct_thread WHERE id = %s",
            (thread_id,),
        ).fetchone()
        if not t or user_id not in (str(t[0]), str(t[1])):
            raise HTTPException(404, "会话不存在")
        peer = str(t[1]) if str(t[0]) == user_id else str(t[0])
        fr = conn.execute(
            "SELECT 1 FROM friendship WHERE user_id = %s AND friend_id = %s",
            (user_id, peer),
        ).fetchone()
        if not fr:
            raise HTTPException(403, "仅好友可私信")
        row = conn.execute(
            "INSERT INTO direct_message (thread_id, sender_id, kind, body, ref, reply_to_id) "
            "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, created_at",
            (thread_id, user_id, kind, text or None, body.ref, body.reply_to_id),
        ).fetchone()
        conn.commit()
    return {"id": str(row[0]), "created_at": row[1].isoformat() if row[1] else None}


# ── 群闲聊 ──
@router.post("/groups/{gid}/chat")
def send_group_chat(
    gid: str, body: ChatIn, user_id: str = Depends(get_current_user),
) -> dict:
    text = body.body.strip()
    try:
        moderate_text(text)
    except ModerationError as e:
        raise HTTPException(400, e.reason) from e
    pool = get_pool()
    with pool.connection() as conn:
        _ensure_im_tables(conn)
        access.require_member(conn, gid, user_id)
        allow = conn.execute(
            "SELECT COALESCE(allow_chat, true) FROM social_group WHERE id = %s", (gid,),
        ).fetchone()
        if allow and allow[0] is False:
            raise HTTPException(403, "本群已关闭闲聊")
        mentions = body.mentions[:20]
        row = conn.execute(
            "INSERT INTO group_message (group_id, user_id, kind, body, reply_to_id, mentions) "
            "VALUES (%s, %s, 'chat', %s, %s, %s::jsonb) RETURNING id, created_at",
            (
                gid,
                user_id,
                text,
                body.reply_to_id,
                __import__("json").dumps(mentions),
            ),
        ).fetchone()
        conn.commit()
    return {"id": str(row[0]), "created_at": row[1].isoformat() if row[1] else None}


@router.patch("/groups/{gid}/allow-chat")
def set_allow_chat(
    gid: str, body: AllowChatIn, user_id: str = Depends(get_current_user),
) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        access.require_owner(conn, gid, user_id)
        conn.execute(
            "UPDATE social_group SET allow_chat = %s WHERE id = %s",
            (body.allow_chat, gid),
        )
        conn.execute(
            "INSERT INTO group_message (group_id, user_id, kind, body) VALUES (%s, %s, 'system', %s)",
            (
                gid,
                user_id,
                "群主已开启闲聊" if body.allow_chat else "群主已关闭闲聊",
            ),
        )
        conn.commit()
    return {"ok": True, "allow_chat": body.allow_chat}


@router.post("/groups/{gid}/admins")
def set_admins(
    gid: str, body: SetAdminsIn, user_id: str = Depends(get_current_user),
) -> dict:
    ids = [x.strip() for x in body.user_ids if x.strip()][:5]
    pool = get_pool()
    with pool.connection() as conn:
        access.require_owner(conn, gid, user_id)
        # 先把非 owner 的 admin 降为 member
        conn.execute(
            "UPDATE group_member SET role = 'member' "
            "WHERE group_id = %s AND role = 'admin'",
            (gid,),
        )
        for uid in ids:
            if uid == user_id:
                continue
            m = conn.execute(
                "SELECT role FROM group_member WHERE group_id = %s AND user_id = %s",
                (gid, uid),
            ).fetchone()
            if not m:
                raise HTTPException(400, f"用户不是群成员: {uid[:8]}")
            if m[0] == "owner":
                continue
            conn.execute(
                "UPDATE group_member SET role = 'admin' "
                "WHERE group_id = %s AND user_id = %s",
                (gid, uid),
            )
        conn.commit()
    return {"ok": True, "admin_ids": ids}


@router.post("/messages/{mid}/recall")
def recall_message(mid: str, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    now = datetime.now(timezone.utc)
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT group_id, user_id, created_at, recalled_at FROM group_message WHERE id = %s",
            (mid,),
        ).fetchone()
        if row:
            gid, author, created, recalled = str(row[0]), str(row[1]), row[2], row[3]
            if recalled:
                return {"ok": True}
            role = access.require_member(conn, gid, user_id)
            is_author = author == user_id
            staff = access.can_moderate_messages(role)
            if not is_author and not staff:
                raise HTTPException(403, "无权撤回")
            if is_author and not staff:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if now - created > _RECALL_WINDOW:
                    raise HTTPException(400, "超过 2 分钟无法撤回")
            conn.execute(
                "UPDATE group_message SET recalled_at = %s, body = NULL WHERE id = %s",
                (now, mid),
            )
            conn.commit()
            return {"ok": True, "scope": "group"}

        row = conn.execute(
            "SELECT thread_id, sender_id, created_at, recalled_at FROM direct_message WHERE id = %s",
            (mid,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "消息不存在")
        thread_id, author, created, recalled = str(row[0]), str(row[1]), row[2], row[3]
        if recalled:
            return {"ok": True}
        t = conn.execute(
            "SELECT user_low_id, user_high_id FROM direct_thread WHERE id = %s",
            (thread_id,),
        ).fetchone()
        if not t or user_id not in (str(t[0]), str(t[1])):
            raise HTTPException(403, "无权撤回")
        if author != user_id:
            raise HTTPException(403, "只能撤回自己的私信")
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if now - created > _RECALL_WINDOW:
            raise HTTPException(400, "超过 2 分钟无法撤回")
        conn.execute(
            "UPDATE direct_message SET recalled_at = %s, body = NULL WHERE id = %s",
            (now, mid),
        )
        conn.commit()
    return {"ok": True, "scope": "dm"}


@router.post("/reports")
def create_report(body: ReportIn, user_id: str = Depends(get_current_user)) -> dict:
    import json as _json

    reason = body.reason if body.reason in (
        "spam", "abuse", "heresy", "illegal", "other",
    ) else "other"
    if body.target_type not in ("group_message", "dm", "group", "user"):
        raise HTTPException(400, "无效 target_type")
    pool = get_pool()
    with pool.connection() as conn:
        snap: dict = {"target_type": body.target_type, "target_id": body.target_id}
        if body.target_type == "group_message":
            m = conn.execute(
                "SELECT group_id, user_id, kind, body, created_at FROM group_message WHERE id = %s",
                (body.target_id,),
            ).fetchone()
            if m:
                snap["group_id"] = str(m[0])
                snap["author_id"] = str(m[1])
                snap["kind"] = m[2]
                snap["body"] = m[3]
                snap["created_at"] = m[4].isoformat() if m[4] else None
                atts = conn.execute(
                    "SELECT file_name, mime, storage_key FROM message_attachment "
                    "WHERE scope = 'group' AND message_id = %s",
                    (body.target_id,),
                ).fetchall()
                snap["attachments"] = [
                    {"file_name": a[0], "mime": a[1], "storage_key": a[2]} for a in atts
                ]
        elif body.target_type == "dm":
            m = conn.execute(
                "SELECT thread_id, sender_id, kind, body, created_at FROM direct_message WHERE id = %s",
                (body.target_id,),
            ).fetchone()
            if m:
                snap["thread_id"] = str(m[0])
                snap["author_id"] = str(m[1])
                snap["kind"] = m[2]
                snap["body"] = m[3]
                snap["created_at"] = m[4].isoformat() if m[4] else None
                atts = conn.execute(
                    "SELECT file_name, mime, storage_key FROM message_attachment "
                    "WHERE scope = 'dm' AND message_id = %s",
                    (body.target_id,),
                ).fetchall()
                snap["attachments"] = [
                    {"file_name": a[0], "mime": a[1], "storage_key": a[2]} for a in atts
                ]
        case = conn.execute(
            "INSERT INTO moderation_case (reporter_id, target_type, target_id, reason) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (user_id, body.target_type, body.target_id, reason),
        ).fetchone()
        conn.execute(
            "INSERT INTO moderation_snapshot (case_id, payload) VALUES (%s, %s::jsonb)",
            (case[0], _json.dumps(snap, ensure_ascii=False)),
        )
        conn.commit()
    return {"id": str(case[0]), "status": "open"}


@router.post("/retention/run")
def run_retention(
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
) -> dict:
    """消息 30 天清理：删消息 + 孤儿附件行 + 尽力删磁盘文件。需 PUSH_CRON_SECRET。"""
    settings = get_settings()
    if not settings.push_cron_secret or x_cron_secret != settings.push_cron_secret:
        raise HTTPException(403, "无效 cron 密钥")
    cutoff = _retention_cutoff()
    pool = get_pool()
    storage_keys: list[str] = []
    with pool.connection() as conn:
        try:
            rows = conn.execute(
                """
                SELECT storage_key FROM message_attachment a
                WHERE (
                  a.scope = 'group' AND EXISTS (
                    SELECT 1 FROM group_message m
                    WHERE m.id = a.message_id AND m.created_at < %s
                  )
                ) OR (
                  a.scope = 'dm' AND EXISTS (
                    SELECT 1 FROM direct_message m
                    WHERE m.id = a.message_id AND m.created_at < %s
                  )
                )
                """,
                (cutoff, cutoff),
            ).fetchall()
            storage_keys = [str(r[0]) for r in rows if r[0]]
        except Exception:
            storage_keys = []
        g = conn.execute(
            "DELETE FROM group_message WHERE created_at < %s RETURNING id",
            (cutoff,),
        ).fetchall()
        d = conn.execute(
            "DELETE FROM direct_message WHERE created_at < %s RETURNING id",
            (cutoff,),
        ).fetchall()
        att_deleted = 0
        try:
            att = conn.execute(
                """
                DELETE FROM message_attachment a
                WHERE (a.scope = 'group' AND NOT EXISTS (
                  SELECT 1 FROM group_message m WHERE m.id = a.message_id
                )) OR (a.scope = 'dm' AND NOT EXISTS (
                  SELECT 1 FROM direct_message m WHERE m.id = a.message_id
                ))
                RETURNING id
                """
            ).fetchall()
            att_deleted = len(att)
        except Exception:
            att_deleted = 0
        conn.commit()
    files_removed = unlink_storage_keys(storage_keys)
    return {
        "ok": True,
        "deleted_group_messages": len(g),
        "deleted_dm_messages": len(d),
        "deleted_attachments": att_deleted,
        "files_removed": files_removed,
        "cutoff": cutoff.isoformat(),
    }


class MediaSendIn(BaseModel):
    storage_key: str
    file_name: str | None = None
    mime: str | None = None
    size_bytes: int | None = None
    url: str | None = None
    body: str | None = Field(default=None, max_length=500)
    mentions: list[str] = Field(default_factory=list, max_length=20)
    reply_to_id: str | None = None


@router.post("/uploads")
async def upload_social_media(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
) -> dict:
    from .media import save_social_upload

    meta = await save_social_upload(file=file, prefix=user_id[:8])
    return {"ok": True, **meta}


def _user_can_read_attachment(conn, user_id: str, storage_key: str) -> tuple[bytes, str] | None:
    """校验用户有权读取附件，返回 (bytes, file_name)。"""
    norm = normalize_object_key(storage_key)
    if not norm:
        return None
    row = conn.execute(
        """
        SELECT a.file_name, a.storage_key, a.scope
        FROM message_attachment a
        WHERE a.storage_key = %s
           OR a.storage_key LIKE %s
           OR a.storage_key LIKE %s
        LIMIT 1
        """,
        (storage_key, f"%/{norm}", f"%{norm}"),
    ).fetchone()
    if not row:
        return None
    file_name, db_key, scope = row[0], row[1], row[2]
    mid_row = conn.execute(
        """
        SELECT message_id::text FROM message_attachment
        WHERE storage_key = %s OR storage_key = %s
        LIMIT 1
        """,
        (storage_key, db_key),
    ).fetchone()
    if not mid_row:
        return None
    message_id = mid_row[0]
    if scope == "group":
        ok = conn.execute(
            """
            SELECT 1 FROM group_message m
            JOIN group_member gm ON gm.group_id = m.group_id AND gm.user_id = %s
            WHERE m.id = %s::uuid
            LIMIT 1
            """,
            (user_id, message_id),
        ).fetchone()
    else:
        ok = conn.execute(
            """
            SELECT 1 FROM direct_message dm
            JOIN direct_thread dt ON dt.id = dm.thread_id
            WHERE dm.id = %s::uuid
              AND (%s::uuid IN (dt.user_low_id, dt.user_high_id))
            LIMIT 1
            """,
            (message_id, user_id),
        ).fetchone()
    if not ok:
        return None
    store = get_blob_store()
    try:
        data = store.read_bytes(db_key or storage_key)
    except Exception:
        return None
    return data, (file_name or norm)


@router.get("/media/preview")
def preview_social_media(
    storage_key: str = Query(..., min_length=4),
    user_id: str = Depends(get_current_user),
) -> Response:
    """doc/ppt 等需服务端转 PDF 的预览（需安装 LibreOffice）。"""
    pool = get_pool()
    with pool.connection() as conn:
        hit = _user_can_read_attachment(conn, user_id, storage_key)
    if not hit:
        raise HTTPException(404, "附件不存在或无权访问")
    data, file_name = hit
    if not needs_server_pdf_preview(file_name):
        raise HTTPException(400, "此类型请使用客户端预览")
    pdf = convert_office_to_pdf(data, file_name)
    if not pdf:
        raise HTTPException(503, "服务端未安装 LibreOffice，无法预览此文件")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.post("/groups/{gid}/media")
def send_group_media(
    gid: str, body: MediaSendIn, user_id: str = Depends(get_current_user),
) -> dict:
    import json as _json

    pool = get_pool()
    with pool.connection() as conn:
        access.require_member(conn, gid, user_id)
        allow = conn.execute(
            "SELECT COALESCE(allow_chat, true) FROM social_group WHERE id = %s", (gid,),
        ).fetchone()
        if allow and allow[0] is False:
            raise HTTPException(403, "本群已关闭闲聊")
        kind = "image" if (body.mime or "").startswith("image/") else "file"
        if body.url and "/social-media/" in body.url and body.mime is None:
            kind = "image" if any(
                body.url.lower().endswith(x) for x in (".png", ".jpg", ".jpeg", ".gif", ".webp")
            ) else "file"
        text = (body.body or "").strip() or None
        if text:
            try:
                moderate_text(text)
            except ModerationError as e:
                raise HTTPException(400, e.reason) from e
        row = conn.execute(
            "INSERT INTO group_message (group_id, user_id, kind, body, reply_to_id, mentions) "
            "VALUES (%s, %s, %s, %s, %s, %s::jsonb) RETURNING id, created_at",
            (
                gid,
                user_id,
                kind,
                text,
                body.reply_to_id,
                _json.dumps(body.mentions[:20]),
            ),
        ).fetchone()
        mid = row[0]
        conn.execute(
            "INSERT INTO message_attachment "
            "(scope, message_id, storage_key, file_name, mime, size_bytes) "
            "VALUES ('group', %s, %s, %s, %s, %s)",
            (
                mid,
                body.storage_key,
                body.file_name,
                body.mime,
                body.size_bytes,
            ),
        )
        conn.commit()
    return {"id": str(mid), "kind": kind, "created_at": row[1].isoformat() if row[1] else None}


@router.post("/dm/{thread_id}/media")
def send_dm_media(
    thread_id: str, body: MediaSendIn, user_id: str = Depends(get_current_user),
) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        t = conn.execute(
            "SELECT user_low_id, user_high_id FROM direct_thread WHERE id = %s",
            (thread_id,),
        ).fetchone()
        if not t or user_id not in (str(t[0]), str(t[1])):
            raise HTTPException(404, "会话不存在")
        peer = str(t[1]) if str(t[0]) == user_id else str(t[0])
        fr = conn.execute(
            "SELECT 1 FROM friendship WHERE user_id = %s AND friend_id = %s",
            (user_id, peer),
        ).fetchone()
        if not fr:
            raise HTTPException(403, "仅好友可私信")
        kind = "image" if (body.mime or "").startswith("image/") else "file"
        text = (body.body or "").strip() or None
        if text:
            try:
                moderate_text(text)
            except ModerationError as e:
                raise HTTPException(400, e.reason) from e
        row = conn.execute(
            "INSERT INTO direct_message (thread_id, sender_id, kind, body, reply_to_id) "
            "VALUES (%s, %s, %s, %s, %s) RETURNING id, created_at",
            (thread_id, user_id, kind, text, body.reply_to_id),
        ).fetchone()
        conn.execute(
            "INSERT INTO message_attachment "
            "(scope, message_id, storage_key, file_name, mime, size_bytes) "
            "VALUES ('dm', %s, %s, %s, %s, %s)",
            (row[0], body.storage_key, body.file_name, body.mime, body.size_bytes),
        )
        conn.commit()
    return {"id": str(row[0]), "kind": kind}


@router.get("/search/messages")
def search_messages(
    q: str,
    user_id: str = Depends(get_current_user),
    limit: int = 30,
    scope: str | None = None,
    ref_id: str | None = None,
) -> dict:
    query = (q or "").strip()
    if len(query) < 1:
        return {"items": []}
    if len(query) > 80:
        raise HTTPException(400, "搜索词过长")
    limit = max(1, min(limit, 50))
    cutoff = _retention_cutoff()
    like = f"%{query}%"
    scope_n = (scope or "").strip().lower() or None
    ref = (ref_id or "").strip() or None
    in_thread = scope_n in ("group", "dm") and bool(ref)
    pool = get_pool()
    items: list[dict] = []
    with pool.connection() as conn:
        # 会话内搜索：跳过标题匹配，只搜该会话正文
        if not in_thread:
            grows_title = conn.execute(
                """
                SELECT g.id, g.name
                FROM social_group g
                JOIN group_member mb ON mb.group_id = g.id AND mb.user_id = %s
                WHERE g.name ILIKE %s
                ORDER BY g.name
                LIMIT %s
                """,
                (user_id, like, min(10, limit)),
            ).fetchall()
            for r in grows_title:
                items.append({
                    "scope": "group",
                    "message_id": f"title:{r[0]}",
                    "ref_id": str(r[0]),
                    "title": r[1],
                    "kind": "conversation",
                    "snippet": "共读群",
                    "created_at": None,
                })
            drows_title = conn.execute(
                """
                SELECT t.id, t.user_low_id, t.user_high_id
                FROM direct_thread t
                WHERE (t.user_low_id = %s OR t.user_high_id = %s)
                LIMIT 80
                """,
                (user_id, user_id),
            ).fetchall()
            title_peers = [
                str(r[2]) if str(r[1]) == user_id else str(r[1])
                for r in drows_title
            ]
            title_names = _displays(conn, title_peers)
            for r in drows_title:
                peer = str(r[2]) if str(r[1]) == user_id else str(r[1])
                name = title_names.get(peer) or f"用户{peer[:4]}"
                if query.lower() in name.lower():
                    items.append({
                        "scope": "dm",
                        "message_id": f"title:{r[0]}",
                        "ref_id": str(r[0]),
                        "title": name,
                        "kind": "conversation",
                        "snippet": "私信",
                        "created_at": None,
                    })

        if not in_thread or scope_n == "group":
            if in_thread:
                grows = conn.execute(
                    """
                    SELECT m.id, m.group_id, g.name, m.kind, m.body, m.created_at, m.user_id
                    FROM group_message m
                    JOIN group_member mb ON mb.group_id = m.group_id AND mb.user_id = %s
                    JOIN social_group g ON g.id = m.group_id
                    WHERE m.group_id = %s
                      AND m.recalled_at IS NULL AND m.created_at >= %s
                      AND m.body ILIKE %s
                    ORDER BY m.created_at DESC
                    LIMIT %s
                    """,
                    (user_id, ref, cutoff, like, limit),
                ).fetchall()
            else:
                grows = conn.execute(
                    """
                    SELECT m.id, m.group_id, g.name, m.kind, m.body, m.created_at, m.user_id
                    FROM group_message m
                    JOIN group_member mb ON mb.group_id = m.group_id AND mb.user_id = %s
                    JOIN social_group g ON g.id = m.group_id
                    WHERE m.recalled_at IS NULL AND m.created_at >= %s
                      AND m.body ILIKE %s
                    ORDER BY m.created_at DESC
                    LIMIT %s
                    """,
                    (user_id, cutoff, like, limit),
                ).fetchall()
            for r in grows:
                items.append({
                    "scope": "group",
                    "message_id": str(r[0]),
                    "ref_id": str(r[1]),
                    "title": r[2],
                    "kind": r[3],
                    "snippet": (r[4] or "")[:120],
                    "created_at": r[5].isoformat() if r[5] else None,
                })

        if not in_thread or scope_n == "dm":
            if in_thread:
                drows = conn.execute(
                    """
                    SELECT dm.id, dm.thread_id, dm.kind, dm.body, dm.created_at,
                           t.user_low_id, t.user_high_id
                    FROM direct_message dm
                    JOIN direct_thread t ON t.id = dm.thread_id
                    WHERE dm.thread_id = %s
                      AND (t.user_low_id = %s OR t.user_high_id = %s)
                      AND dm.recalled_at IS NULL AND dm.created_at >= %s
                      AND dm.body ILIKE %s
                    ORDER BY dm.created_at DESC
                    LIMIT %s
                    """,
                    (ref, user_id, user_id, cutoff, like, limit),
                ).fetchall()
            else:
                drows = conn.execute(
                    """
                    SELECT dm.id, dm.thread_id, dm.kind, dm.body, dm.created_at,
                           t.user_low_id, t.user_high_id
                    FROM direct_message dm
                    JOIN direct_thread t ON t.id = dm.thread_id
                    WHERE (t.user_low_id = %s OR t.user_high_id = %s)
                      AND dm.recalled_at IS NULL AND dm.created_at >= %s
                      AND dm.body ILIKE %s
                    ORDER BY dm.created_at DESC
                    LIMIT %s
                    """,
                    (user_id, user_id, cutoff, like, limit),
                ).fetchall()
            msg_peers = [
                str(r[6]) if str(r[5]) == user_id else str(r[5])
                for r in drows
            ]
            msg_names = _displays(conn, msg_peers)
            for r in drows:
                peer = str(r[6]) if str(r[5]) == user_id else str(r[5])
                items.append({
                    "scope": "dm",
                    "message_id": str(r[0]),
                    "ref_id": str(r[1]),
                    "title": msg_names.get(peer) or f"用户{peer[:4]}",
                    "kind": r[2],
                    "snippet": (r[3] or "")[:120],
                    "created_at": r[4].isoformat() if r[4] else None,
                })
    titles = [x for x in items if x.get("kind") == "conversation"]
    msgs = [x for x in items if x.get("kind") != "conversation"]
    msgs.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"items": (titles + msgs)[:limit]}


@router.get("/realtime/cursor")
def realtime_cursor(user_id: str = Depends(get_current_user)) -> dict:
    """轻量补拉：返回用户相关会话的最近消息时间，客户端对比后刷新。"""
    now = time.monotonic()
    with _cursor_lock:
        hit = _cursor_cache.get(user_id)
        if hit and now - hit[0] < _CURSOR_TTL_SEC:
            return hit[1]

    pool = get_pool()
    cutoff = _retention_cutoff()
    with pool.connection() as conn:
        gmax = conn.execute(
            """
            SELECT COALESCE(MAX(gm.created_at), '-infinity'::timestamptz)
            FROM group_message gm
            JOIN group_member m ON m.group_id = gm.group_id AND m.user_id = %s
            WHERE gm.created_at >= %s
            """,
            (user_id, cutoff),
        ).fetchone()[0]
        dmax = conn.execute(
            """
            SELECT COALESCE(MAX(dm.created_at), '-infinity'::timestamptz)
            FROM direct_message dm
            JOIN direct_thread t ON t.id = dm.thread_id
            WHERE (t.user_low_id = %s OR t.user_high_id = %s)
              AND dm.created_at >= %s
            """,
            (user_id, user_id, cutoff),
        ).fetchone()[0]

    def iso(v):
        if v is None or str(v).startswith("-"):
            return None
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    result = {
        "group_max": iso(gmax),
        "dm_max": iso(dmax),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
    with _cursor_lock:
        _cursor_cache[user_id] = (time.monotonic(), result)
        # 防止缓存无限增长
        if len(_cursor_cache) > 2000:
            cutoff_t = time.monotonic() - 60
            stale = [k for k, (ts, _) in _cursor_cache.items() if ts < cutoff_t]
            for k in stale:
                _cursor_cache.pop(k, None)
    return result


@router.get("/realtime/sse")
async def realtime_sse(user_id: str = Depends(get_current_user)):
    """PWA 实时：SSE 推送 cursor 变化（约 5s 探测）；连接最长约 25 分钟后客户端重连。"""

    async def gen():
        last: tuple[str | None, str | None] | None = None
        ticks = 0
        yield f"event: hello\ndata: {_json_mod.dumps({'ok': True})}\n\n"
        while ticks < 300:
            try:
                cur = realtime_cursor(user_id)
                key = (cur.get("group_max"), cur.get("dm_max"))
                if key != last:
                    last = key
                    yield f"event: cursor\ndata: {_json_mod.dumps(cur, ensure_ascii=False)}\n\n"
                else:
                    yield ": ping\n\n"
            except Exception:
                yield f"event: error\ndata: {_json_mod.dumps({'message': 'cursor failed'})}\n\n"
                break
            ticks += 1
            await asyncio.sleep(5)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
