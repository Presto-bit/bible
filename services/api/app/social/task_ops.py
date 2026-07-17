"""群任务 v2：类型、完成规则、附件、指派、系列/定时、计划日自动任务、到期提醒。"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from ..config import REPO_ROOT, get_settings
from ..content import loader

logger = logging.getLogger(__name__)

TASK_TYPES = ("read", "memorize", "pray", "share", "custom")
COMPLETION_RULES = ("tap", "checkin_text", "checkin_ref", "read_done")

DEFAULT_RULE_BY_TYPE = {
    "read": "read_done",
    "memorize": "checkin_ref",
    "pray": "tap",
    "share": "checkin_text",
    "custom": "checkin_text",
}

_ALLOW_SUFFIX = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
_ALLOW_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}
_MAX_ATTACH_BYTES = 15 * 1024 * 1024
_MAX_ATTACH_COUNT = 3
_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def task_attachments_dir() -> Path:
    settings = get_settings()
    raw = getattr(settings, "group_task_upload_dir", None)
    base = Path(raw) if raw else (REPO_ROOT / "data" / "group_task_uploads")
    base.mkdir(parents=True, exist_ok=True)
    return base


def normalize_task_type(value: str | None) -> str:
    v = (value or "custom").strip().lower()
    return v if v in TASK_TYPES else "custom"


def normalize_completion_rule(value: str | None, task_type: str) -> str:
    v = (value or "").strip().lower()
    if v in COMPLETION_RULES:
        return v
    return DEFAULT_RULE_BY_TYPE.get(task_type, "checkin_text")


def parse_due_at(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError as exc:
        raise HTTPException(400, "截止时间格式无效") from exc


def parse_publish_at(raw: str | None) -> datetime | None:
    return parse_due_at(raw)


def ref_from_plan_day_row(row: dict) -> str | None:
    book = (row.get("book_id") or row.get("book") or "").strip()
    ch = row.get("chapter_start") or row.get("chapter")
    if book and ch:
        return f"{book}.{int(ch)}"
    ref = (row.get("ref") or "").strip()
    return ref or None


def title_from_plan_day(plan_title: str, day: int, row: dict) -> str:
    label = (row.get("label") or row.get("title") or "").strip()
    if label:
        return f"今日读经 · 第{day}天 · {label}"
    ref = ref_from_plan_day_row(row)
    if ref:
        return f"今日读经 · 第{day}天 · {ref}"
    return f"今日读经 · {plan_title} 第{day}天"


def ensure_plan_day_task(conn, *, gid: str, plan_id: str, owner_id: str) -> str | None:
    """若群绑定读经计划，确保「今天对应计划日」有一条自动任务。"""
    plan = loader.get_reading_plan(plan_id)
    if not plan:
        return None
    days = plan.get("days") or []
    if not days:
        return None
    # 用群平均进度或第 1 天：优先取成员 plan_progress 众数/均值，简化为 day = max(1, round(avg))
    total = len(days)
    prog = conn.execute(
        "SELECT COALESCE(AVG(day), 1) FROM plan_progress "
        "WHERE plan_id = %s AND user_id IN (SELECT user_id FROM group_member WHERE group_id = %s)",
        (plan_id, gid),
    ).fetchone()
    avg = float(prog[0] or 1) if prog else 1.0
    day_num = max(1, min(total, int(round(avg)) or 1))
    row = next((d for d in days if int(d.get("day") or 0) == day_num), days[0])
    day_num = int(row.get("day") or day_num)
    existing = conn.execute(
        "SELECT id FROM group_task WHERE group_id = %s AND source = 'plan_day' "
        "AND plan_id = %s AND plan_day = %s LIMIT 1",
        (gid, plan_id, day_num),
    ).fetchone()
    if existing:
        return str(existing[0])

    title = title_from_plan_day(plan.get("title") or plan_id, day_num, row)
    ref = ref_from_plan_day_row(row)
    due = datetime.now(timezone.utc).replace(hour=23, minute=59, second=0, microsecond=0)
    tid = conn.execute(
        "INSERT INTO group_task ("
        "  group_id, title, ref, created_by, due_at, template_id, "
        "  task_type, completion_rule, body, status, publish_at, "
        "  source, plan_id, plan_day"
        ") VALUES ("
        "  %s, %s, %s, %s, %s, %s, "
        "  'read', 'read_done', %s, 'published', NOW(), "
        "  'plan_day', %s, %s"
        ") RETURNING id",
        (
            gid,
            title,
            ref,
            owner_id,
            due,
            "plan_day_auto",
            f"来自计划「{plan.get('title') or plan_id}」第 {day_num} 天",
            plan_id,
            day_num,
        ),
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO group_message (group_id, user_id, kind, ref, task_id, body) "
        "VALUES (%s, %s, 'task', %s, %s, %s)",
        (gid, owner_id, ref, tid, title),
    )
    return str(tid)


def publish_due_scheduled_tasks(conn, *, gid: str) -> int:
    """将到期的 scheduled 任务改为 published，并写入任务消息。"""
    rows = conn.execute(
        "SELECT id, title, ref, created_by FROM group_task "
        "WHERE group_id = %s AND status = 'scheduled' "
        "AND publish_at IS NOT NULL AND publish_at <= NOW()",
        (gid,),
    ).fetchall()
    n = 0
    for r in rows:
        tid, title, ref, created_by = r
        conn.execute(
            "UPDATE group_task SET status = 'published' WHERE id = %s",
            (tid,),
        )
        exists = conn.execute(
            "SELECT 1 FROM group_message WHERE group_id = %s AND task_id = %s AND kind = 'task' LIMIT 1",
            (gid, tid),
        ).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO group_message (group_id, user_id, kind, ref, task_id, body) "
                "VALUES (%s, %s, 'task', %s, %s, %s)",
                (gid, created_by, ref, tid, title),
            )
        n += 1
    return n


def send_due_reminders(conn, *, gid: str) -> int:
    """截止前 24h 内发一条系统提醒（每任务一次）。"""
    rows = conn.execute(
        "SELECT id, title, due_at FROM group_task "
        "WHERE group_id = %s AND status = 'published' "
        "AND due_at IS NOT NULL AND reminder_sent_at IS NULL "
        "AND due_at > NOW() AND due_at <= NOW() + INTERVAL '24 hours'",
        (gid,),
    ).fetchall()
    if not rows:
        return 0
    owner = conn.execute(
        "SELECT owner_id FROM social_group WHERE id = %s", (gid,),
    ).fetchone()
    owner_id = owner[0] if owner else None
    if not owner_id:
        return 0
    n = 0
    for tid, title, due_at in rows:
        body = f"提醒：任务「{title}」将于 {_fmt_due(due_at)} 截止"
        conn.execute(
            "INSERT INTO group_message (group_id, user_id, kind, task_id, body) "
            "VALUES (%s, %s, 'system', %s, %s)",
            (gid, owner_id, tid, body),
        )
        conn.execute(
            "UPDATE group_task SET reminder_sent_at = NOW() WHERE id = %s",
            (tid,),
        )
        n += 1
    return n


def _fmt_due(due_at: datetime) -> str:
    try:
        local = due_at.astimezone(timezone.utc)
        return local.strftime("%m-%d %H:%M UTC")
    except Exception:
        return "即将"


def list_attachments(conn, task_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT id, file_name, mime_type, size_bytes, url, created_at "
        "FROM group_task_attachment WHERE task_id = %s ORDER BY created_at ASC",
        (task_id,),
    ).fetchall()
    return [
        {
            "id": str(r[0]),
            "file_name": r[1],
            "mime_type": r[2],
            "size_bytes": int(r[3] or 0),
            "url": r[4],
            "created_at": r[5].isoformat() if r[5] else None,
        }
        for r in rows
    ]


def list_assignee_ids(conn, task_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT user_id FROM group_task_assignee WHERE task_id = %s",
        (task_id,),
    ).fetchall()
    return [str(r[0]) for r in rows]


def user_can_see_task(conn, *, task_id: str, user_id: str, is_owner: bool) -> bool:
    if is_owner:
        return True
    assignees = list_assignee_ids(conn, task_id)
    if not assignees:
        return True
    return user_id in assignees


def validate_checkin_for_task(
    conn,
    *,
    task_id: str,
    user_id: str,
    body: str | None,
    ref: str | None,
) -> dict[str, Any]:
    row = conn.execute(
        "SELECT id, title, ref, task_type, completion_rule, status "
        "FROM group_task WHERE id = %s",
        (task_id,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "任务不存在")
    if (row[5] or "published") != "published":
        raise HTTPException(400, "任务尚未开始")
    rule = normalize_completion_rule(row[4], normalize_task_type(row[3]))
    text = (body or "").strip()
    task_ref = row[2]
    if rule == "checkin_text" and not text:
        raise HTTPException(400, "该任务需要写下感想才能完成")
    if rule == "checkin_ref" and not (ref or task_ref):
        raise HTTPException(400, "该任务需要关联经文")
    return {
        "id": str(row[0]),
        "title": row[1],
        "ref": task_ref,
        "task_type": normalize_task_type(row[3]),
        "completion_rule": rule,
    }


async def save_task_upload(
    *,
    gid: str,
    file: UploadFile,
) -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOW_SUFFIX:
        raise HTTPException(400, "仅支持 JPG / PNG / WebP / PDF")
    raw = await file.read()
    if len(raw) > _MAX_ATTACH_BYTES:
        raise HTTPException(400, "单个附件不能超过 15MB")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in _ALLOW_MIME:
        # 部分浏览器 PDF 会给 octet-stream，按后缀放行
        if not (suffix == ".pdf" and content_type in ("application/octet-stream", "")):
            if content_type not in _ALLOW_MIME:
                raise HTTPException(400, "不支持的文件类型")
    if not content_type or content_type == "application/octet-stream":
        content_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".pdf": "application/pdf",
        }[suffix]
    digest = hashlib.sha256(raw).hexdigest()[:16]
    safe_gid = gid if _ID_RE.match(gid.replace("-", "")) or True else "group"
    filename = f"{safe_gid[:8]}-{digest}{suffix}"
    dest = task_attachments_dir() / filename
    dest.write_bytes(raw)
    from ..auth.local_session import make_media_asset_sig
    import time as _time

    exp = int(_time.time()) + 86_400
    object_key = f"group-task/{filename}"
    sig = make_media_asset_sig(object_key, exp)
    url = f"/content/group-task/assets/{filename}?exp={exp}&sig={sig}"
    return {
        "file_name": Path(file.filename or filename).name[:180],
        "mime_type": content_type,
        "size_bytes": len(raw),
        "storage_path": str(dest),
        "url": url,
    }


def insert_attachments(conn, *, gid: str, task_id: str, attachments: list[dict]) -> None:
    if not attachments:
        return
    if len(attachments) > _MAX_ATTACH_COUNT:
        raise HTTPException(400, f"最多上传 {_MAX_ATTACH_COUNT} 个附件")
    for a in attachments:
        conn.execute(
            "INSERT INTO group_task_attachment "
            "(task_id, group_id, file_name, mime_type, size_bytes, storage_path, url) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                task_id,
                gid,
                a["file_name"],
                a["mime_type"],
                int(a.get("size_bytes") or 0),
                a["storage_path"],
                a["url"],
            ),
        )


def insert_assignees(conn, *, gid: str, task_id: str, user_ids: list[str] | None) -> None:
    if not user_ids:
        return
    uniq = []
    seen = set()
    for uid in user_ids:
        u = (uid or "").strip()
        if not u or u in seen:
            continue
        seen.add(u)
        uniq.append(u)
    if not uniq:
        return
    for uid in uniq:
        member = conn.execute(
            "SELECT 1 FROM group_member WHERE group_id = %s AND user_id = %s::uuid",
            (gid, uid),
        ).fetchone()
        if not member:
            raise HTTPException(400, "指派对象必须是群成员")
        conn.execute(
            "INSERT INTO group_task_assignee (task_id, user_id) VALUES (%s, %s::uuid) "
            "ON CONFLICT DO NOTHING",
            (task_id, uid),
        )


def create_series_tasks(
    conn,
    *,
    gid: str,
    owner_id: str,
    title: str,
    task_type: str,
    completion_rule: str,
    body: str | None,
    ref: str | None,
    total_days: int,
    start_at: datetime,
    due_hours: int = 24,
    assignee_ids: list[str] | None = None,
    attachments: list[dict] | None = None,
) -> dict:
    days = max(1, min(30, int(total_days)))
    series_id = conn.execute(
        "INSERT INTO group_task_series "
        "(group_id, title, task_type, completion_rule, total_days, created_by) "
        "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (gid, title, task_type, completion_rule, days, owner_id),
    ).fetchone()[0]
    task_ids: list[str] = []
    for i in range(days):
        publish_at = start_at + timedelta(days=i)
        due_at = publish_at + timedelta(hours=max(1, due_hours))
        status = "published" if publish_at <= datetime.now(timezone.utc) else "scheduled"
        day_title = f"{title} · 第{i + 1}/{days}天"
        tid = conn.execute(
            "INSERT INTO group_task ("
            "  group_id, title, ref, created_by, due_at, template_id, "
            "  task_type, completion_rule, body, status, publish_at, "
            "  series_id, series_day, source"
            ") VALUES ("
            "  %s, %s, %s, %s, %s, %s, "
            "  %s, %s, %s, %s, %s, "
            "  %s, %s, 'series'"
            ") RETURNING id",
            (
                gid,
                day_title,
                ref,
                owner_id,
                due_at,
                "series",
                task_type,
                completion_rule,
                body,
                status,
                publish_at,
                series_id,
                i + 1,
            ),
        ).fetchone()[0]
        insert_assignees(conn, gid=gid, task_id=str(tid), user_ids=assignee_ids)
        if i == 0 and attachments:
            insert_attachments(conn, gid=gid, task_id=str(tid), attachments=attachments)
        if status == "published":
            conn.execute(
                "INSERT INTO group_message (group_id, user_id, kind, ref, task_id, body) "
                "VALUES (%s, %s, 'task', %s, %s, %s)",
                (gid, owner_id, ref, tid, day_title),
            )
        task_ids.append(str(tid))
    return {"series_id": str(series_id), "task_ids": task_ids, "total_days": days}
