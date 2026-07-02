"""社交：共读群（仅打卡/任务，不支持自由聊天）+ 好友（无私聊）。

所有接口需认证（get_current_user）。群打卡须挂经文或任务（PRODUCT 规则）。
"""
from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Depends, HTTPException
from psycopg import errors as pg_errors
from pydantic import BaseModel

from ..auth.session import get_current_user
from ..auth.user_code import pick_user_code, uuid_for_code
from ..content import loader
from ..db import get_pool
from .moderation import ModerationError, moderate_text

router = APIRouter(prefix="/social", tags=["social"])


# ── 模型 ──
class CreateGroup(BaseModel):
    name: str
    intro: str | None = None
    plan_id: str | None = None


class CreateGroupFromPlan(BaseModel):
    plan_id: str
    name: str | None = None


class JoinGroup(BaseModel):
    join_code: str


class CreateTask(BaseModel):
    title: str
    ref: str | None = None
    due_at: str | None = None
    template_id: str | None = None


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


class UpdateGroup(BaseModel):
    name: str | None = None
    plan_id: str | None = None
    announcement: str | None = None
    clear_plan: bool = False


class TransferGroup(BaseModel):
    new_owner_id: str


class PublishShare(BaseModel):
    ref: str | None = None
    body: str
    kind: str = "thought"


def _plan_total_days(plan_id: str) -> int:
    for p in loader.list_plans():
        if p["plan_id"] == plan_id:
            return int(p.get("days") or 0)
    return 0


def _group_plan_progress(
    conn, gid: str, plan_id: str | None, user_id: str,
) -> dict:
    if not plan_id:
        return {}
    total = _plan_total_days(plan_id)
    if total <= 0:
        return {"plan_days_total": 0, "plan_progress_pct": 0}
    member_rows = conn.execute(
        "SELECT user_id FROM group_member WHERE group_id = %s", (gid,)
    ).fetchall()
    if not member_rows:
        return {
            "plan_days_total": total,
            "plan_progress_pct": 0,
            "plan_day_avg": 0,
            "members_on_plan": 0,
            "my_plan_day": 0,
        }
    member_ids = [str(r[0]) for r in member_rows]
    if not member_ids:
        return {
            "plan_days_total": total,
            "plan_progress_pct": 0,
            "plan_day_avg": 0,
            "members_on_plan": 0,
            "my_plan_day": 0,
        }
    ph = ",".join(["%s"] * len(member_ids))
    rows = conn.execute(
        f"SELECT user_id, COALESCE(day, 0) FROM plan_progress "
        f"WHERE plan_id = %s AND user_id IN ({ph})",
        (plan_id, *member_ids),
    ).fetchall()
    day_by_user = {str(r[0]): int(r[1]) for r in rows}
    my_day = day_by_user.get(user_id, 0)
    started = list(day_by_user.values())
    avg = (sum(started) / len(started)) if started else 0.0
    pct = min(100, round((avg / total) * 100)) if total else 0
    return {
        "plan_days_total": total,
        "plan_day_avg": round(avg, 1),
        "plan_progress_pct": pct,
        "members_on_plan": len(started),
        "my_plan_day": my_day,
    }


def _weekly_group_stats(conn, gid: str) -> dict:
    checkins = conn.execute(
        "SELECT count(*)::int FROM group_message WHERE group_id = %s "
        "AND kind = 'checkin' AND created_at >= date_trunc('week', CURRENT_DATE)",
        (gid,),
    ).fetchone()[0]
    active_days = conn.execute(
        "SELECT count(DISTINCT created_at::date)::int FROM group_message "
        "WHERE group_id = %s AND kind IN ('checkin', 'task', 'system') "
        "AND created_at >= date_trunc('week', CURRENT_DATE)",
        (gid,),
    ).fetchone()[0]
    return {"weekly_checkins": checkins, "weekly_active_days": active_days}


def _maybe_milestone_all_checked(conn, gid: str, owner_id: str) -> None:
    mc = conn.execute(
        "SELECT count(*)::int FROM group_member WHERE group_id = %s", (gid,),
    ).fetchone()[0]
    if mc <= 0:
        return
    cc = conn.execute(
        "SELECT count(DISTINCT user_id)::int FROM group_message "
        "WHERE group_id = %s AND kind = 'checkin' AND created_at::date = CURRENT_DATE",
        (gid,),
    ).fetchone()[0]
    if cc < mc:
        return
    exists = conn.execute(
        "SELECT 1 FROM group_message WHERE group_id = %s AND kind = 'system' "
        "AND created_at::date = CURRENT_DATE AND body LIKE %s",
        (gid, "%全员打卡%"),
    ).fetchone()
    if exists:
        return
    conn.execute(
        "INSERT INTO group_message (group_id, user_id, kind, body) "
        "VALUES (%s, %s, 'system', %s)",
        (gid, owner_id, "🎉 今日全员打卡达成，一起感谢坚持！"),
    )


def _plan_label(plan_id: str | None) -> str | None:
    if not plan_id:
        return None
    for p in loader.list_plans():
        if p["plan_id"] == plan_id:
            return p["title"]
    return plan_id


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
        gid = None
        code = None
        for _ in range(8):
            code = _gen_code()
            try:
                row = conn.execute(
                    "INSERT INTO social_group (name, intro, owner_id, join_code, plan_id) "
                    "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (name, body.intro, user_id, code, body.plan_id),
                ).fetchone()
                gid = row[0]
                break
            except pg_errors.UniqueViolation:
                conn.rollback()
                continue
        if gid is None or code is None:
            raise HTTPException(500, "生成邀请码失败，请重试")
        conn.execute(
            "INSERT INTO group_member (group_id, user_id, role) VALUES (%s, %s, 'owner')",
            (gid, user_id),
        )
        conn.commit()
    return {"id": str(gid), "name": name, "join_code": code, "role": "owner"}


@router.post("/groups/from-plan")
def create_group_from_plan(
    body: CreateGroupFromPlan, user_id: str = Depends(get_current_user),
) -> dict:
    """G3：从个人计划一键成群。"""
    plan_id = body.plan_id.strip()
    if not plan_id:
        raise HTTPException(400, "plan_id 不能为空")
    title = _plan_label(plan_id) or plan_id
    name = (body.name or f"{title} · 共读").strip()[:80]
    return create_group(
        CreateGroup(name=name, intro=f"一起完成「{title}」", plan_id=plan_id),
        user_id,
    )


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
            "SELECT g.id, g.name, g.intro, g.join_code, m.role, g.plan_id "
            "FROM social_group g JOIN group_member m ON m.group_id = g.id "
            "WHERE m.user_id = %s ORDER BY g.created_at DESC",
            (user_id,),
        ).fetchall()
        groups = []
        for r in rows:
            gid = str(r[0])
            stats = _group_today_stats(conn, gid, user_id)
            plan_stats = _group_plan_progress(conn, gid, r[5], user_id)
            groups.append({
                "id": gid, "name": r[1], "intro": r[2], "join_code": r[3],
                "role": r[4], "plan_id": r[5], "plan_title": _plan_label(r[5]),
                **stats, **plan_stats,
            })
    return {"groups": groups}


@router.get("/discover/summary")
def discover_summary(user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT g.id FROM social_group g JOIN group_member m ON m.group_id = g.id "
            "WHERE m.user_id = %s AND COALESCE(m.muted, false) = false",
            (user_id,),
        ).fetchall()
        groups_pending_checkin = 0
        groups_pending_tasks = 0
        for (gid,) in rows:
            stats = _group_today_stats(conn, str(gid), user_id)
            if not stats["my_checked_in_today"]:
                groups_pending_checkin += 1
            if stats["open_tasks"] > 0:
                groups_pending_tasks += 1
        friends_checked_in_today = conn.execute(
            "SELECT count(DISTINCT m.user_id)::int FROM group_message m "
            "JOIN friendship f ON f.friend_id = m.user_id AND f.user_id = %s "
            "WHERE m.kind = 'checkin' AND m.created_at::date = CURRENT_DATE",
            (user_id,),
        ).fetchone()[0]
        first_pending_group_id = None
        for (gid,) in rows:
            stats = _group_today_stats(conn, str(gid), user_id)
            if not stats["my_checked_in_today"] or stats["open_tasks"] > 0:
                first_pending_group_id = str(gid)
                break
    return {
        "groups_pending_checkin": groups_pending_checkin,
        "groups_pending_tasks": groups_pending_tasks,
        "friends_checked_in_today": friends_checked_in_today,
        "first_pending_group_id": first_pending_group_id,
    }


@router.get("/push/digest")
def push_digest(user_id: str = Depends(get_current_user)) -> dict:
    """F1：个性化聚合摘要（供前台 Notification / 后续 Web Push）。"""
    summary = discover_summary(user_id)
    parts: list[str] = []
    if summary["groups_pending_checkin"] > 0:
        parts.append(f'{summary["groups_pending_checkin"]} 个群待打卡')
    if summary["groups_pending_tasks"] > 0:
        parts.append(f'{summary["groups_pending_tasks"]} 个群任务待完成')
    if summary["friends_checked_in_today"] > 0:
        parts.append(f'今天 {summary["friends_checked_in_today"]} 位好友已打卡')
    if not parts:
        body = "今日已全部打卡，继续保持 ✓"
        href = "/discover"
    else:
        body = " · ".join(parts)
        gid = summary.get("first_pending_group_id")
        href = f"/discover/group/{gid}" if gid else "/discover"
    return {"title": "今日共读", "body": body, "href": href}


@router.post("/shares")
def publish_share(body: PublishShare, user_id: str = Depends(get_current_user)) -> dict:
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "分享内容不能为空")
    try:
        moderate_text(text)
    except ModerationError as e:
        raise HTTPException(400, e.reason) from e
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "INSERT INTO user_share (user_id, kind, ref, body) "
            "VALUES (%s, %s, %s, %s) RETURNING id, created_at",
            (user_id, (body.kind or "thought").strip()[:32], body.ref, text[:2000]),
        ).fetchone()
        conn.commit()
    return {"id": str(row[0]), "created_at": row[1].isoformat()}


@router.get("/friends/activity")
def friends_activity(user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        checkins = conn.execute(
            "SELECT m.id, u.display_name, m.ref, m.body, m.reactions, m.created_at, "
            "  m.group_id, g.name "
            "FROM group_message m "
            "JOIN users u ON u.id = m.user_id "
            "JOIN friendship f ON f.friend_id = m.user_id AND f.user_id = %s "
            "JOIN social_group g ON g.id = m.group_id "
            "WHERE m.kind = 'checkin' "
            "ORDER BY m.created_at DESC LIMIT 20",
            (user_id,),
        ).fetchall()
        shares = conn.execute(
            "SELECT s.id, u.display_name, s.ref, s.body, s.kind, s.created_at, s.reactions "
            "FROM user_share s "
            "JOIN users u ON u.id = s.user_id "
            "JOIN friendship f ON f.friend_id = s.user_id AND f.user_id = %s "
            "ORDER BY s.created_at DESC LIMIT 20",
            (user_id,),
        ).fetchall()
    items = []
    for r in checkins:
        items.append({
            "id": str(r[0]),
            "author": r[1],
            "ref": r[2],
            "body": r[3],
            "reactions": r[4] or {},
            "created_at": r[5].isoformat(),
            "source": "group",
            "kind": "checkin",
            "group_id": str(r[6]),
            "group_name": r[7],
        })
    for r in shares:
        items.append({
            "id": str(r[0]),
            "author": r[1],
            "ref": r[2],
            "body": r[3],
            "reactions": (r[6] or {}) if len(r) > 6 else {},
            "created_at": r[5].isoformat(),
            "source": "share",
            "kind": r[4],
            "group_id": None,
            "group_name": None,
        })
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {"items": items[:30]}


def _group_today_stats(conn, gid: str, user_id: str) -> dict:
    member_count = conn.execute(
        "SELECT count(*)::int FROM group_member WHERE group_id = %s", (gid,)
    ).fetchone()[0]
    checked_today = conn.execute(
        "SELECT count(DISTINCT user_id)::int FROM group_message "
        "WHERE group_id = %s AND kind = 'checkin' AND created_at::date = CURRENT_DATE",
        (gid,),
    ).fetchone()[0]
    my_checked = conn.execute(
        "SELECT 1 FROM group_message "
        "WHERE group_id = %s AND user_id = %s AND kind = 'checkin' "
        "AND created_at::date = CURRENT_DATE LIMIT 1",
        (gid, user_id),
    ).fetchone() is not None
    open_tasks = conn.execute(
        "SELECT count(*)::int FROM group_task gt WHERE gt.group_id = %s "
        "AND NOT EXISTS ("
        "  SELECT 1 FROM group_message m "
        "  WHERE m.group_id = %s AND m.user_id = %s AND m.kind = 'checkin' "
        "  AND m.task_id = gt.id"
        ")",
        (gid, gid, user_id),
    ).fetchone()[0]
    return {
        "members": member_count,
        "checked_in_today": checked_today,
        "my_checked_in_today": my_checked,
        "open_tasks": open_tasks,
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
            "SELECT name, intro, join_code, plan_id, announcement, icebreaker_done, "
            "pinned_task_id, owner_id FROM social_group WHERE id = %s", (gid,)
        ).fetchone()
        if not g:
            raise HTTPException(404, "群不存在")
        plan_id = g[3]
        if plan_id:
            members = conn.execute(
                "SELECT u.id, u.display_name, m.role, "
                "  EXISTS ("
                "    SELECT 1 FROM group_message gm "
                "    WHERE gm.group_id = %s AND gm.user_id = u.id AND gm.kind = 'checkin' "
                "    AND gm.created_at::date = CURRENT_DATE"
                "  ) AS checked_today, "
                "  COALESCE(pp.day, 0) AS plan_day "
                "FROM group_member m "
                "JOIN users u ON u.id = m.user_id "
                "LEFT JOIN plan_progress pp ON pp.user_id = u.id AND pp.plan_id = %s "
                "WHERE m.group_id = %s "
                "ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, m.joined_at ASC",
                (gid, plan_id, gid),
            ).fetchall()
        else:
            members = conn.execute(
                "SELECT u.id, u.display_name, m.role, "
                "  EXISTS ("
                "    SELECT 1 FROM group_message gm "
                "    WHERE gm.group_id = %s AND gm.user_id = u.id AND gm.kind = 'checkin' "
                "    AND gm.created_at::date = CURRENT_DATE"
                "  ) AS checked_today, "
                "  0 AS plan_day "
                "FROM group_member m "
                "JOIN users u ON u.id = m.user_id "
                "WHERE m.group_id = %s "
                "ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, m.joined_at ASC",
                (gid, gid),
            ).fetchall()
        tasks = conn.execute(
            "SELECT id, title, ref, due_at FROM group_task WHERE group_id = %s "
            "ORDER BY created_at DESC",
            (gid,),
        ).fetchall()
        stats = _group_today_stats(conn, gid, user_id)
        plan_stats = _group_plan_progress(conn, gid, g[3], user_id)
        weekly = _weekly_group_stats(conn, gid)
        muted_row = conn.execute(
            "SELECT muted FROM group_member WHERE group_id = %s AND user_id = %s",
            (gid, user_id),
        ).fetchone()
        muted = bool(muted_row[0]) if muted_row else False
        pinned_task_id = str(g[6]) if g[6] else None
        task_rows = []
        for t in tasks:
            tid = str(t[0])
            done = conn.execute(
                "SELECT 1 FROM group_message "
                "WHERE group_id = %s AND user_id = %s AND kind = 'checkin' "
                "AND task_id = %s LIMIT 1",
                (gid, user_id, tid),
            ).fetchone() is not None
            task_rows.append({
                "id": tid,
                "title": t[1],
                "ref": t[2],
                "due_at": t[3].isoformat() if t[3] else None,
                "completed": done,
                "pinned": tid == pinned_task_id,
            })
    return {
        "id": gid, "name": g[0], "intro": g[1], "join_code": g[2], "role": role,
        "plan_id": g[3], "plan_title": _plan_label(g[3]), "announcement": g[4],
        "icebreaker_done": bool(g[5]),
        "pinned_task_id": pinned_task_id,
        "muted": muted,
        **weekly,
        "members": [
            {
                "user_id": str(m[0]),
                "name": (m[1] or "").strip() or f"用户{str(m[0])[:4]}",
                "role": m[2],
                "checked_in_today": bool(m[3]),
                "plan_day": int(m[4] or 0),
                "is_me": str(m[0]) == user_id,
            }
            for m in members
        ],
        "tasks": task_rows,
        **stats, **plan_stats,
    }


@router.patch("/groups/{gid}")
def update_group(
    gid: str, body: UpdateGroup, user_id: str = Depends(get_current_user),
) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        role = _require_member(conn, gid, user_id)
        if role != "owner":
            raise HTTPException(403, "仅群主可修改群设置")
        sets: list[str] = []
        params: list = []
        if body.name is not None:
            name = body.name.strip()
            if not name:
                raise HTTPException(400, "群名不能为空")
            try:
                moderate_text(name)
            except ModerationError as e:
                raise HTTPException(400, e.reason) from e
            sets.append("name = %s")
            params.append(name)
        if body.clear_plan:
            sets.append("plan_id = NULL")
        elif body.plan_id is not None:
            sets.append("plan_id = %s")
            params.append(body.plan_id.strip() or None)
        if body.announcement is not None:
            try:
                moderate_text(body.announcement)
            except ModerationError as e:
                raise HTTPException(400, e.reason) from e
            sets.append("announcement = %s")
            params.append((body.announcement or "").strip()[:500] or None)
        if not sets:
            raise HTTPException(400, "无更新字段")
        params.append(gid)
        conn.execute(
            f"UPDATE social_group SET {', '.join(sets)} WHERE id = %s",
            tuple(params),
        )
        conn.commit()
    return {"ok": True}


@router.post("/groups/{gid}/transfer")
def transfer_group(
    gid: str, body: TransferGroup, user_id: str = Depends(get_current_user),
) -> dict:
    pool = get_pool()
    new_owner = body.new_owner_id.strip()
    if not new_owner:
        raise HTTPException(400, "须指定新群主")
    if new_owner == user_id:
        raise HTTPException(400, "不能转让给自己")
    with pool.connection() as conn:
        role = _require_member(conn, gid, user_id)
        if role != "owner":
            raise HTTPException(403, "仅群主可转让")
        row = conn.execute(
            "SELECT 1 FROM group_member WHERE group_id = %s AND user_id = %s",
            (gid, new_owner),
        ).fetchone()
        if not row:
            raise HTTPException(404, "目标用户不是群成员")
        conn.execute(
            "UPDATE group_member SET role = 'member' WHERE group_id = %s AND user_id = %s",
            (gid, user_id),
        )
        conn.execute(
            "UPDATE group_member SET role = 'owner' WHERE group_id = %s AND user_id = %s",
            (gid, new_owner),
        )
        conn.execute(
            "UPDATE social_group SET owner_id = %s WHERE id = %s",
            (new_owner, gid),
        )
        conn.commit()
    return {"ok": True}


@router.delete("/groups/{gid}/members/{mid}")
def remove_member(
    gid: str, mid: str, user_id: str = Depends(get_current_user),
) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        role = _require_member(conn, gid, user_id)
        if mid != user_id and role != "owner":
            raise HTTPException(403, "仅群主可移除成员")
        target = conn.execute(
            "SELECT role FROM group_member WHERE group_id = %s AND user_id = %s",
            (gid, mid),
        ).fetchone()
        if not target:
            raise HTTPException(404, "成员不存在")
        if target[0] == "owner":
            if mid == user_id:
                raise HTTPException(400, "群主请先转让群主或解散群")
            raise HTTPException(400, "不能移除群主")
        conn.execute(
            "DELETE FROM group_member WHERE group_id = %s AND user_id = %s",
            (gid, mid),
        )
        conn.commit()
    return {"ok": True}


@router.delete("/groups/{gid}")
def dissolve_group(gid: str, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        role = _require_member(conn, gid, user_id)
        if role != "owner":
            raise HTTPException(403, "仅群主可解散群")
        conn.execute("DELETE FROM social_group WHERE id = %s", (gid,))
        conn.commit()
    return {"ok": True}


@router.get("/groups/{gid}/feed")
def group_feed(
    gid: str,
    before: str | None = None,
    limit: int = 40,
    user_id: str = Depends(get_current_user),
) -> dict:
    """群动态 Feed；默认返回最新 limit 条，before 加载更早消息。"""
    limit = max(1, min(limit, 100))
    pool = get_pool()
    with pool.connection() as conn:
        _require_member(conn, gid, user_id)
        _ensure_report_table(conn)
        base_sql = (
            "SELECT m.id, u.display_name, m.user_id, m.kind, m.ref, m.body, "
            "  m.reactions, m.created_at, m.task_id, gt.due_at "
            "FROM group_message m JOIN users u ON u.id = m.user_id "
            "LEFT JOIN group_task gt ON gt.id = m.task_id "
            "WHERE m.group_id = %s "
            "  AND (SELECT count(DISTINCT r.reporter_id) FROM message_report r "
            "       WHERE r.message_id = m.id) < %s "
        )
        if before:
            rows = conn.execute(
                base_sql + "AND m.created_at < %s::timestamptz "
                "ORDER BY m.created_at DESC LIMIT %s",
                (gid, REPORT_HIDE_THRESHOLD, before, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                base_sql + "ORDER BY m.created_at DESC LIMIT %s",
                (gid, REPORT_HIDE_THRESHOLD, limit),
            ).fetchall()
        has_more = False
        if rows:
            oldest_ts = rows[-1][7]
            has_more = conn.execute(
                "SELECT 1 FROM group_message m WHERE m.group_id = %s "
                "AND m.created_at < %s LIMIT 1",
                (gid, oldest_ts),
            ).fetchone() is not None
        rows = list(reversed(rows))
        messages = []
        for r in rows:
            task_id = str(r[8]) if r[8] else None
            my_task_done = False
            if r[3] == "task" and task_id:
                my_task_done = conn.execute(
                    "SELECT 1 FROM group_message "
                    "WHERE group_id = %s AND user_id = %s AND kind = 'checkin' "
                    "AND task_id = %s LIMIT 1",
                    (gid, user_id, task_id),
                ).fetchone() is not None
            author = "系统" if r[3] == "system" else ((r[1] or "").strip() or f"用户{str(r[2])[-4:]}")
            messages.append({
                "id": str(r[0]), "author": author, "mine": str(r[2]) == user_id,
                "kind": r[3], "ref": r[4], "body": r[5],
                "reactions": r[6] or {}, "created_at": r[7].isoformat(),
                "task_id": task_id,
                "task_due_at": r[9].isoformat() if r[9] else None,
                "my_task_done": my_task_done,
            })
    return {"messages": messages, "has_more": has_more}


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
        owner = conn.execute(
            "SELECT owner_id FROM social_group WHERE id = %s", (gid,),
        ).fetchone()[0]
        _maybe_milestone_all_checked(conn, gid, str(owner))
        conn.execute(
            "UPDATE social_group SET icebreaker_done = true WHERE id = %s",
            (gid,),
        )
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
            "INSERT INTO group_task (group_id, title, ref, created_by, due_at, template_id) "
            "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (gid, body.title.strip(), body.ref, user_id, body.due_at, body.template_id),
        ).fetchone()
        task_id = row[0]
        conn.execute(
            "INSERT INTO group_message (group_id, user_id, kind, ref, task_id, body) "
            "VALUES (%s, %s, 'task', %s, %s, %s)",
            (gid, user_id, body.ref, task_id, body.title.strip()),
        )
        conn.commit()
    return {"id": str(task_id), "title": body.title.strip(), "ref": body.ref}


@router.patch("/groups/{gid}/tasks/{tid}/pin")
def pin_task(gid: str, tid: str, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        role = _require_member(conn, gid, user_id)
        if role != "owner":
            raise HTTPException(403, "仅群主可置顶任务")
        row = conn.execute(
            "SELECT 1 FROM group_task WHERE id = %s AND group_id = %s", (tid, gid),
        ).fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
        conn.execute(
            "UPDATE social_group SET pinned_task_id = %s WHERE id = %s", (tid, gid),
        )
        conn.commit()
    return {"ok": True, "pinned_task_id": tid}


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
        if row:
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
        srow = conn.execute(
            "SELECT reactions FROM user_share WHERE id = %s", (mid,)
        ).fetchone()
        if not srow:
            raise HTTPException(404, "消息不存在")
        reactions = srow[0] or {}
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
            "UPDATE user_share SET reactions = %s::jsonb WHERE id = %s",
            (json.dumps(reactions), mid),
        )
        conn.commit()
    return {"reactions": reactions}


@router.post("/groups/{gid}/nudge")
def nudge_group(gid: str, user_id: str = Depends(get_current_user)) -> dict:
    """F2：群主轻推掉队成员（系统化提醒，非聊天）。"""
    pool = get_pool()
    with pool.connection() as conn:
        role = _require_member(conn, gid, user_id)
        if role != "owner":
            raise HTTPException(403, "仅群主可轻推")
        pending = conn.execute(
            "SELECT count(*)::int FROM group_member gm WHERE gm.group_id = %s "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM group_message m WHERE m.group_id = %s "
            "  AND m.user_id = gm.user_id AND m.kind = 'checkin' "
            "  AND m.created_at::date = CURRENT_DATE"
            ")",
            (gid, gid),
        ).fetchone()[0]
        conn.commit()
    return {
        "ok": True,
        "pending_members": pending,
        "message": f"已提醒 {pending} 位伙伴完成今日打卡",
    }


@router.patch("/groups/{gid}/mute")
def mute_group(gid: str, muted: bool = True, user_id: str = Depends(get_current_user)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        _require_member(conn, gid, user_id)
        conn.execute(
            "UPDATE group_member SET muted = %s WHERE group_id = %s AND user_id = %s",
            (muted, gid, user_id),
        )
        conn.commit()
    return {"ok": True, "muted": muted}


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
    key = body.handle.strip()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, display_name, handle FROM users WHERE handle = %s", (key,)
        ).fetchone()
        if not row and pick_user_code(key):
            uid = uuid_for_code(key)
            row = conn.execute(
                "SELECT id, display_name, handle FROM users WHERE id = %s", (uid,)
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
