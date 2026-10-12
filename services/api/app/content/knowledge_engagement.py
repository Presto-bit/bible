"""探索手稿：按页点赞 + 公开评论（无楼中楼）。"""
from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth.session import get_current_user
from ..db import get_pool

router = APIRouter(tags=["content-knowledge-engagement"])

_TOPIC_RE = re.compile(r"^[a-zA-Z0-9_./:-]{1,128}$")
_PAGE_RE = re.compile(r"^[a-zA-Z0-9_./:-]{1,128}$")


def ensure_knowledge_engagement_schema() -> None:
    with get_pool().connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS knowledge_page_like (
              topic_id TEXT NOT NULL,
              page_key TEXT NOT NULL,
              user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              PRIMARY KEY (topic_id, page_key, user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS knowledge_page_comment (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              topic_id TEXT NOT NULL,
              page_key TEXT NOT NULL,
              user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              body TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS knowledge_page_comment_idx
              ON knowledge_page_comment (topic_id, page_key, created_at ASC)
            """
        )


def _check_ids(topic_id: str, page_key: str) -> tuple[str, str]:
    tid = (topic_id or "").strip()
    pk = (page_key or "").strip()
    if not _TOPIC_RE.match(tid) or not _PAGE_RE.match(pk):
        raise HTTPException(400, "无效的专题或页标识")
    return tid, pk


def _display_name(conn, user_id: str) -> str:
    row = conn.execute(
        """
        SELECT COALESCE(
          NULLIF(TRIM(u.display_name), ''),
          NULLIF(TRIM(u.handle), ''),
          NULLIF(TRIM(up.user_code), ''),
          '同路人'
        )
        FROM users u
        LEFT JOIN user_profile up ON up.user_id = u.id
        WHERE u.id = %s::uuid
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    return str(row[0]) if row and row[0] else "同路人"


def _iso(v: Any) -> str | None:
    if v is None:
        return None
    try:
        return v.isoformat()
    except Exception:
        return str(v)


class CommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=500)


@router.get("/knowledge-layouts/{topic_id}/pages/{page_key}/engagement")
def get_page_engagement(
    topic_id: str,
    page_key: str,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_knowledge_engagement_schema()
    tid, pk = _check_ids(topic_id, page_key)
    with get_pool().connection() as conn:
        liked = bool(
            conn.execute(
                """
                SELECT 1 FROM knowledge_page_like
                WHERE topic_id = %s AND page_key = %s AND user_id = %s::uuid
                """,
                (tid, pk, user_id),
            ).fetchone()
        )
        likes = conn.execute(
            """
            SELECT count(*)::int FROM knowledge_page_like
            WHERE topic_id = %s AND page_key = %s
            """,
            (tid, pk),
        ).fetchone()[0]
        rows = conn.execute(
            """
            SELECT c.id::text, c.user_id::text, c.body, c.created_at
            FROM knowledge_page_comment c
            WHERE c.topic_id = %s AND c.page_key = %s
            ORDER BY c.created_at ASC
            LIMIT 200
            """,
            (tid, pk),
        ).fetchall()
        comments = []
        for r in rows:
            comments.append(
                {
                    "id": r[0],
                    "userId": r[1],
                    "displayName": _display_name(conn, r[1]),
                    "body": r[2],
                    "createdAt": _iso(r[3]),
                }
            )
    return {
        "liked": liked,
        "likesCount": likes,
        "commentsCount": len(comments),
        "comments": comments,
    }


@router.post("/knowledge-layouts/{topic_id}/pages/{page_key}/like")
def toggle_page_like(
    topic_id: str,
    page_key: str,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_knowledge_engagement_schema()
    tid, pk = _check_ids(topic_id, page_key)
    with get_pool().connection() as conn:
        existing = conn.execute(
            """
            SELECT 1 FROM knowledge_page_like
            WHERE topic_id = %s AND page_key = %s AND user_id = %s::uuid
            """,
            (tid, pk, user_id),
        ).fetchone()
        if existing:
            conn.execute(
                """
                DELETE FROM knowledge_page_like
                WHERE topic_id = %s AND page_key = %s AND user_id = %s::uuid
                """,
                (tid, pk, user_id),
            )
            liked = False
        else:
            conn.execute(
                """
                INSERT INTO knowledge_page_like (topic_id, page_key, user_id)
                VALUES (%s, %s, %s::uuid)
                """,
                (tid, pk, user_id),
            )
            liked = True
        count = conn.execute(
            """
            SELECT count(*)::int FROM knowledge_page_like
            WHERE topic_id = %s AND page_key = %s
            """,
            (tid, pk),
        ).fetchone()[0]
    return {"liked": liked, "likesCount": count}


@router.post("/knowledge-layouts/{topic_id}/pages/{page_key}/comments")
def add_page_comment(
    topic_id: str,
    page_key: str,
    body: CommentBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_knowledge_engagement_schema()
    tid, pk = _check_ids(topic_id, page_key)
    text = body.body.strip()
    if not text:
        raise HTTPException(400, "评论不能为空")
    if len(text) > 500:
        raise HTTPException(400, "评论过长")
    with get_pool().connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO knowledge_page_comment (topic_id, page_key, user_id, body)
            VALUES (%s, %s, %s::uuid, %s)
            RETURNING id::text, user_id::text, body, created_at
            """,
            (tid, pk, user_id, text),
        )
        c = cur.fetchone()
        name = _display_name(conn, user_id)
    return {
        "comment": {
            "id": c[0],
            "userId": c[1],
            "displayName": name,
            "body": c[2],
            "createdAt": _iso(c[3]),
        }
    }
