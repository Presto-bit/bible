"""管理后台 · 用户触达。"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..db import get_pool
from ..social.official_outreach import (
    BROADCAST_MAX_PER_MONTH,
    enqueue_broadcast_job,
    welcome_notice_body,
    welcome_notice_ref_json,
)
from ..social.outreach_schema import ensure_outreach_schema
from .auth import require_admin

router = APIRouter(prefix="/outreach", tags=["admin-outreach"])


class BroadcastJobIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=4000)
    audience: str = "all"
    actions: list[dict[str, str]] | None = None


@router.get("/jobs")
def list_jobs(_admin: str = Depends(require_admin)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        ensure_outreach_schema(conn)
        rows = conn.execute(
            """
            SELECT id::text, kind, template_key, title, audience, status,
                   total_targets, sent_count, skipped_count, failed_count,
                   created_at, sent_at
            FROM platform_outreach_job
            ORDER BY created_at DESC
            LIMIT 50
            """
        ).fetchall()
    return {
        "jobs": [
            {
                "id": r[0],
                "kind": r[1],
                "template_key": r[2],
                "title": r[3],
                "audience": r[4],
                "status": r[5],
                "total_targets": r[6],
                "sent_count": r[7],
                "skipped_count": r[8],
                "failed_count": r[9],
                "created_at": r[10].isoformat() if r[10] else None,
                "sent_at": r[11].isoformat() if r[11] else None,
            }
            for r in rows
        ],
        "broadcast_max_per_month": BROADCAST_MAX_PER_MONTH,
    }


@router.post("/broadcast")
def create_broadcast(body: BroadcastJobIn, admin: str = Depends(require_admin)) -> dict:
    if body.audience not in ("all", "active_30d"):
        raise HTTPException(400, "受众不支持")
    ref: dict[str, Any] = {
        "title": body.title.strip(),
        "actions": body.actions or [],
    }
    pool = get_pool()
    with pool.connection() as conn:
        ensure_outreach_schema(conn)
        row = conn.execute(
            """
            INSERT INTO platform_outreach_job
              (kind, title, body, ref, audience, status, created_by)
            VALUES ('broadcast', %s, %s, %s::jsonb, %s, 'draft', %s)
            RETURNING id::text
            """,
            (body.title.strip(), body.body.strip(), json.dumps(ref, ensure_ascii=False), body.audience, admin),
        ).fetchone()
        conn.commit()
    return {"id": row[0], "status": "draft"}


@router.post("/broadcast/{job_id}/send")
def send_broadcast(job_id: str, _admin: str = Depends(require_admin)) -> dict:
    try:
        return enqueue_broadcast_job(job_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/broadcast/{job_id}")
def get_broadcast(job_id: str, _admin: str = Depends(require_admin)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        ensure_outreach_schema(conn)
        row = conn.execute(
            """
            SELECT id::text, status, total_targets, sent_count, skipped_count, failed_count,
                   created_at, sent_at
            FROM platform_outreach_job WHERE id = %s AND kind = 'broadcast'
            """,
            (job_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
        pending = conn.execute(
            "SELECT count(*)::int FROM platform_outreach_queue "
            "WHERE job_id = %s AND done_at IS NULL",
            (job_id,),
        ).fetchone()
    return {
        "id": row[0],
        "status": row[1],
        "total_targets": row[2],
        "sent_count": row[3],
        "skipped_count": row[4],
        "failed_count": row[5],
        "pending": int(pending[0] or 0) if pending else 0,
        "created_at": row[6].isoformat() if row[6] else None,
        "sent_at": row[7].isoformat() if row[7] else None,
    }


@router.post("/preview-welcome")
def preview_welcome(_admin: str = Depends(require_admin)) -> dict:
    return {
        "body": welcome_notice_body(),
        "ref": json.loads(welcome_notice_ref_json()),
    }


@router.get("/feedback")
def list_feedback(_admin: str = Depends(require_admin), limit: int = 50) -> dict:
    limit = max(1, min(limit, 100))
    pool = get_pool()
    with pool.connection() as conn:
        ensure_outreach_schema(conn)
        rows = conn.execute(
            """
            SELECT f.id::text, f.user_id::text, f.category, f.scene, f.body, f.created_at,
                   COALESCE(ac.user_code, up.user_code) AS user_code
            FROM user_feedback f
            LEFT JOIN accounts ac ON ac.user_id = f.user_id
            LEFT JOIN user_profile up ON up.user_id = f.user_id
            ORDER BY f.created_at DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()
    return {
        "items": [
            {
                "id": r[0],
                "user_id": r[1],
                "category": r[2],
                "scene": r[3],
                "body": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
                "user_code": str(r[6]) if r[6] else None,
            }
            for r in rows
        ]
    }
