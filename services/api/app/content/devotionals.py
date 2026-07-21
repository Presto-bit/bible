"""创世记 50 次同行：schema 补齐 + 进度/打卡 API。"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth.session import get_current_user, try_get_current_user
from ..bible import reader
from ..db import get_pool
from . import loader

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content/devotionals", tags=["devotionals"])

SERIES_ID = "genesis_50_walk"
DEFAULT_DAY = 7
ALLOWED_TABS = {"scripture", "letter", "workbook"}
CHECKIN_EMOJIS = {"🙏", "❤️", "👍", "🙌", "💪", "🔥", "😊", "✝️"}

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS series_participation (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id TEXT NOT NULL,
  last_day INT NOT NULL DEFAULT 7,
  last_tab TEXT NOT NULL DEFAULT 'scripture',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, series_id)
);
CREATE INDEX IF NOT EXISTS series_participation_series_idx
  ON series_participation (series_id, opened_at);
CREATE TABLE IF NOT EXISTS session_checkin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id TEXT NOT NULL,
  day INT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_id, day, user_id)
);
CREATE INDEX IF NOT EXISTS session_checkin_series_day_idx
  ON session_checkin (series_id, day, created_at DESC);
CREATE INDEX IF NOT EXISTS session_checkin_user_idx
  ON session_checkin (user_id, series_id);
CREATE TABLE IF NOT EXISTS checkin_reaction (
  checkin_id UUID NOT NULL REFERENCES session_checkin(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (checkin_id, user_id, emoji)
);
CREATE TABLE IF NOT EXISTS checkin_comment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES session_checkin(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkin_comment_checkin_idx
  ON checkin_comment (checkin_id, created_at DESC);
CREATE TABLE IF NOT EXISTS checkin_report (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, reporter_id)
);
"""

_schema_ready = False


def ensure_devotional_schema(pool=None) -> None:
    global _schema_ready
    if _schema_ready:
        return
    pool = pool or get_pool()
    with pool.connection() as conn:
        conn.execute(_SCHEMA_SQL)
        conn.commit()
    _schema_ready = True


class ProgressBody(BaseModel):
    day: int = Field(ge=1, le=50)
    tab: str = "scripture"


class CheckinBody(BaseModel):
    emoji: str
    body: str | None = Field(default=None, max_length=120)


class CommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=500)


class ReactBody(BaseModel):
    emoji: str


class ReportBody(BaseModel):
    target_type: str
    target_id: str
    reason: str | None = Field(default=None, max_length=200)


def _display_name(conn, user_id: str) -> str:
    row = conn.execute(
        "SELECT COALESCE(NULLIF(display_name, ''), NULLIF(handle, ''), '同行者') "
        "FROM users WHERE id = %s",
        (user_id,),
    ).fetchone()
    return str(row[0]) if row and row[0] else "同行者"


def _series_stats(conn, series_id: str, user_id: str | None, day: int | None = None) -> dict:
    participants = conn.execute(
        "SELECT count(*)::int FROM series_participation WHERE series_id = %s",
        (series_id,),
    ).fetchone()[0]
    my_days = 0
    last_day = DEFAULT_DAY
    last_tab = "scripture"
    checked_days: list[int] = []
    has_opened = False
    if user_id:
        row = conn.execute(
            "SELECT last_day, last_tab FROM series_participation "
            "WHERE user_id = %s AND series_id = %s",
            (user_id, series_id),
        ).fetchone()
        if row:
            has_opened = True
            last_day = int(row[0] or DEFAULT_DAY)
            last_tab = str(row[1] or "scripture")
        days = conn.execute(
            "SELECT day FROM session_checkin WHERE user_id = %s AND series_id = %s "
            "ORDER BY day",
            (user_id, series_id),
        ).fetchall()
        checked_days = [int(r[0]) for r in days]
        my_days = len(checked_days)
        if my_days > 0:
            has_opened = True
    day_checkins = 0
    if day is not None:
        day_checkins = conn.execute(
            "SELECT count(*)::int FROM session_checkin "
            "WHERE series_id = %s AND day = %s",
            (series_id, day),
        ).fetchone()[0]
    today_checkins = conn.execute(
        "SELECT count(*)::int FROM session_checkin "
        "WHERE series_id = %s AND created_at::date = (now() AT TIME ZONE 'Asia/Shanghai')::date",
        (series_id,),
    ).fetchone()[0]
    return {
        "participants_count": participants,
        "my_days": my_days,
        "checked_days": checked_days,
        "last_day": last_day,
        "last_tab": last_tab,
        "today_checkins": today_checkins,
        "day_checkins": day_checkins,
        "has_opened": has_opened,
    }


def _scripture_payload(book: str, chapter: int, focus_verses: str | None) -> dict:
    verses = reader.get_chapter(book, chapter, version=reader.PRIMARY_VERSION)
    return {
        "book": book,
        "chapter": chapter,
        "version": reader.PRIMARY_VERSION,
        "focus_verses": focus_verses,
        "verses": verses,
    }


@router.get("")
def list_series() -> dict:
    ensure_devotional_schema()
    return {"series": loader.list_devotional_series()}


@router.get("/{series_id}")
def series_detail(series_id: str, user_id: str | None = Depends(try_get_current_user)) -> dict:
    ensure_devotional_schema()
    meta = next((s for s in loader.list_devotional_series() if s["series_id"] == series_id), None)
    if not meta:
        raise HTTPException(status_code=404, detail="未知专题")
    summaries = loader.list_devotional_session_summaries(series_id)
    with get_pool().connection() as conn:
        stats = _series_stats(conn, series_id, user_id)
    return {**meta, "sessions": summaries, **stats}


@router.get("/{series_id}/home-card")
def series_home_card(series_id: str = SERIES_ID, user_id: str | None = Depends(try_get_current_user)) -> dict:
    """首页卡轻量接口。"""
    ensure_devotional_schema()
    meta = next((s for s in loader.list_devotional_series() if s["series_id"] == series_id), None)
    if not meta:
        raise HTTPException(status_code=404, detail="未知专题")
    with get_pool().connection() as conn:
        stats = _series_stats(conn, series_id, user_id)
    day = stats["last_day"] if stats.get("has_opened") or stats["my_days"] > 0 else meta.get("default_day", DEFAULT_DAY)
    sess = loader.get_devotional_session(series_id, day)
    return {
        "series_id": series_id,
        "title": meta["title"],
        "subtitle": meta.get("subtitle"),
        "days_total": meta["days_total"],
        "default_day": meta.get("default_day", DEFAULT_DAY),
        "day": day,
        "day_title": (sess or {}).get("title"),
        "last_tab": stats.get("last_tab") or "scripture",
        "participants_count": stats["participants_count"],
        "my_days": stats["my_days"],
        "has_opened": stats["has_opened"] or stats["my_days"] > 0,
        "href": f"/devotionals/{series_id}?day={day}",
    }


@router.get("/{series_id}/day/{day}")
def session_detail(
    series_id: str,
    day: int,
    user_id: str | None = Depends(try_get_current_user),
) -> dict:
    ensure_devotional_schema()
    sess = loader.get_devotional_session(series_id, day)
    if not sess:
        raise HTTPException(status_code=404, detail="无此天")
    scripture = _scripture_payload(sess.get("book") or "GEN", int(sess.get("chapter") or day), sess.get("focus_verses"))
    with get_pool().connection() as conn:
        stats = _series_stats(conn, series_id, user_id, day=day)
        my_checkin = None
        if user_id:
            row = conn.execute(
                "SELECT id, emoji, body, created_at FROM session_checkin "
                "WHERE series_id = %s AND day = %s AND user_id = %s",
                (series_id, day, user_id),
            ).fetchone()
            if row:
                my_checkin = {
                    "id": str(row[0]),
                    "emoji": row[1],
                    "body": row[2],
                    "created_at": row[3].isoformat() if row[3] else None,
                }
    return {
        **sess,
        "scripture": scripture,
        **stats,
        "my_checkin": my_checkin,
        "sessions": loader.list_devotional_session_summaries(series_id),
    }


@router.post("/{series_id}/progress")
def save_progress(
    series_id: str,
    body: ProgressBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_devotional_schema()
    if not loader.get_devotional_session(series_id, body.day):
        raise HTTPException(status_code=404, detail="无此天")
    tab = body.tab if body.tab in ALLOWED_TABS else "scripture"
    with get_pool().connection() as conn:
        conn.execute(
            "INSERT INTO series_participation (user_id, series_id, last_day, last_tab, opened_at, updated_at) "
            "VALUES (%s, %s, %s, %s, now(), now()) "
            "ON CONFLICT (user_id, series_id) DO UPDATE SET "
            "last_day = EXCLUDED.last_day, last_tab = EXCLUDED.last_tab, updated_at = now()",
            (user_id, series_id, body.day, tab),
        )
        conn.commit()
        stats = _series_stats(conn, series_id, user_id, day=body.day)
    return {"ok": True, **stats}


@router.post("/{series_id}/day/{day}/checkin")
def upsert_checkin(
    series_id: str,
    day: int,
    body: CheckinBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_devotional_schema()
    if not loader.get_devotional_session(series_id, day):
        raise HTTPException(status_code=404, detail="无此天")
    emoji = (body.emoji or "").strip()
    if emoji not in CHECKIN_EMOJIS:
        raise HTTPException(status_code=400, detail="请选择有效回应")
    note = (body.body or "").strip() or None
    with get_pool().connection() as conn:
        conn.execute(
            "INSERT INTO series_participation (user_id, series_id, last_day, last_tab, opened_at, updated_at) "
            "VALUES (%s, %s, %s, 'workbook', now(), now()) "
            "ON CONFLICT (user_id, series_id) DO UPDATE SET "
            "last_day = EXCLUDED.last_day, updated_at = now()",
            (user_id, series_id, day),
        )
        row = conn.execute(
            "INSERT INTO session_checkin (series_id, day, user_id, emoji, body, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, now()) "
            "ON CONFLICT (series_id, day, user_id) DO UPDATE SET "
            "emoji = EXCLUDED.emoji, body = EXCLUDED.body, updated_at = now() "
            "RETURNING id, emoji, body, created_at",
            (series_id, day, user_id, emoji, note),
        ).fetchone()
        conn.commit()
        stats = _series_stats(conn, series_id, user_id, day=day)
    return {
        "ok": True,
        "checkin": {
            "id": str(row[0]),
            "emoji": row[1],
            "body": row[2],
            "created_at": row[3].isoformat() if row[3] else None,
            "mine": True,
            "display_name": "我",
        },
        **stats,
    }


@router.delete("/{series_id}/day/{day}/checkin")
def delete_checkin(
    series_id: str,
    day: int,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_devotional_schema()
    with get_pool().connection() as conn:
        conn.execute(
            "DELETE FROM session_checkin WHERE series_id = %s AND day = %s AND user_id = %s",
            (series_id, day, user_id),
        )
        conn.commit()
        stats = _series_stats(conn, series_id, user_id, day=day)
    return {"ok": True, **stats}


@router.get("/{series_id}/day/{day}/feed")
def checkin_feed(
    series_id: str,
    day: int,
    limit: int = Query(30, ge=1, le=100),
    user_id: str | None = Depends(try_get_current_user),
) -> dict:
    ensure_devotional_schema()
    with get_pool().connection() as conn:
        rows = conn.execute(
            "SELECT c.id, c.user_id, c.emoji, c.body, c.created_at, "
            "COALESCE(NULLIF(u.display_name, ''), NULLIF(u.handle, ''), '同行者') "
            "FROM session_checkin c JOIN users u ON u.id = c.user_id "
            "WHERE c.series_id = %s AND c.day = %s "
            "ORDER BY c.created_at DESC LIMIT %s",
            (series_id, day, limit),
        ).fetchall()
        items: list[dict[str, Any]] = []
        for r in rows:
            cid = str(r[0])
            reacts = conn.execute(
                "SELECT emoji, array_agg(user_id::text) FROM checkin_reaction "
                "WHERE checkin_id = %s GROUP BY emoji",
                (cid,),
            ).fetchall()
            reactions = {row[0]: list(row[1] or []) for row in reacts}
            comments = conn.execute(
                "SELECT cm.id, cm.user_id, cm.body, cm.created_at, "
                "COALESCE(NULLIF(u.display_name, ''), NULLIF(u.handle, ''), '同行者') "
                "FROM checkin_comment cm JOIN users u ON u.id = cm.user_id "
                "WHERE cm.checkin_id = %s ORDER BY cm.created_at ASC LIMIT 50",
                (cid,),
            ).fetchall()
            items.append({
                "id": cid,
                "user_id": str(r[1]),
                "emoji": r[2],
                "body": r[3],
                "created_at": r[4].isoformat() if r[4] else None,
                "display_name": r[5],
                "mine": bool(user_id and str(r[1]) == user_id),
                "reactions": reactions,
                "comments": [
                    {
                        "id": str(c[0]),
                        "user_id": str(c[1]),
                        "body": c[2],
                        "created_at": c[3].isoformat() if c[3] else None,
                        "display_name": c[4],
                        "mine": bool(user_id and str(c[1]) == user_id),
                    }
                    for c in comments
                ],
            })
        stats = _series_stats(conn, series_id, user_id, day=day)
    return {"items": items, **stats}


@router.post("/checkins/{checkin_id}/react")
def react_checkin(
    checkin_id: str,
    body: ReactBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_devotional_schema()
    emoji = (body.emoji or "").strip()
    if emoji not in CHECKIN_EMOJIS and not emoji.startswith("phrase:"):
        raise HTTPException(status_code=400, detail="无效回应")
    with get_pool().connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM session_checkin WHERE id = %s", (checkin_id,)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="打卡不存在")
        cur = conn.execute(
            "SELECT 1 FROM checkin_reaction WHERE checkin_id = %s AND user_id = %s AND emoji = %s",
            (checkin_id, user_id, emoji),
        ).fetchone()
        if cur:
            conn.execute(
                "DELETE FROM checkin_reaction WHERE checkin_id = %s AND user_id = %s AND emoji = %s",
                (checkin_id, user_id, emoji),
            )
        else:
            conn.execute(
                "INSERT INTO checkin_reaction (checkin_id, user_id, emoji) VALUES (%s, %s, %s) "
                "ON CONFLICT DO NOTHING",
                (checkin_id, user_id, emoji),
            )
        conn.commit()
        reacts = conn.execute(
            "SELECT emoji, array_agg(user_id::text) FROM checkin_reaction "
            "WHERE checkin_id = %s GROUP BY emoji",
            (checkin_id,),
        ).fetchall()
    return {"reactions": {r[0]: list(r[1] or []) for r in reacts}}


@router.post("/checkins/{checkin_id}/comments")
def add_comment(
    checkin_id: str,
    body: CommentBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_devotional_schema()
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=400, detail="评论不能为空")
    with get_pool().connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM session_checkin WHERE id = %s", (checkin_id,)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="打卡不存在")
        # 简单频率限制：1 分钟内最多 5 条
        recent = conn.execute(
            "SELECT count(*)::int FROM checkin_comment "
            "WHERE user_id = %s AND created_at > now() - interval '1 minute'",
            (user_id,),
        ).fetchone()[0]
        if recent >= 5:
            raise HTTPException(status_code=429, detail="评论太频繁，请稍后再试")
        row = conn.execute(
            "INSERT INTO checkin_comment (checkin_id, user_id, body) VALUES (%s, %s, %s) "
            "RETURNING id, body, created_at",
            (checkin_id, user_id, text),
        ).fetchone()
        conn.commit()
        name = _display_name(conn, user_id)
    return {
        "comment": {
            "id": str(row[0]),
            "user_id": user_id,
            "body": row[1],
            "created_at": row[2].isoformat() if row[2] else None,
            "display_name": name,
            "mine": True,
        }
    }


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: str, user_id: str = Depends(get_current_user)) -> dict:
    ensure_devotional_schema()
    with get_pool().connection() as conn:
        row = conn.execute(
            "SELECT user_id FROM checkin_comment WHERE id = %s", (comment_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="评论不存在")
        if str(row[0]) != user_id:
            raise HTTPException(status_code=403, detail="只能删除自己的评论")
        conn.execute("DELETE FROM checkin_comment WHERE id = %s", (comment_id,))
        conn.commit()
    return {"ok": True}


@router.post("/report")
def report_content(body: ReportBody, user_id: str = Depends(get_current_user)) -> dict:
    ensure_devotional_schema()
    if body.target_type not in ("checkin", "comment"):
        raise HTTPException(status_code=400, detail="无效举报类型")
    with get_pool().connection() as conn:
        conn.execute(
            "INSERT INTO checkin_report (target_type, target_id, reporter_id, reason) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (target_type, target_id, reporter_id) DO NOTHING",
            (body.target_type, body.target_id, user_id, body.reason),
        )
        conn.commit()
    return {"ok": True}
