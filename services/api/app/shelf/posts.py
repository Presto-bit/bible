"""书架书评 / 公开笔记 / 回复服务。"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger(__name__)

VISIBILITY = frozenset({"public", "friends", "private"})
KIND = frozenset({"review", "note"})
READ_STATUS = frozenset({"reading", "finished"})
MAX_BODY = 2000
MAX_REPLY = 500


def _author_row(conn, user_id: str) -> dict[str, Any]:
    row = conn.execute(
        "SELECT id, handle, display_name FROM users WHERE id = %s",
        (user_id,),
    ).fetchone()
    if not row:
        return {"id": user_id, "name": "读者"}
    name = (row[2] or row[1] or "读者").strip() or "读者"
    return {"id": str(row[0]), "name": name}


def _is_friend(conn, viewer_id: str, author_id: str) -> bool:
    if viewer_id == author_id:
        return True
    row = conn.execute(
        "SELECT 1 FROM friendship WHERE user_id = %s AND friend_id = %s",
        (viewer_id, author_id),
    ).fetchone()
    return row is not None


def _can_view_post(
    conn,
    *,
    visibility: str,
    author_id: str,
    viewer_id: str | None,
) -> bool:
    if visibility == "public":
        return True
    if not viewer_id:
        return False
    if visibility == "private":
        return viewer_id == author_id
    if visibility == "friends":
        return _is_friend(conn, viewer_id, author_id)
    return False


def _serialize_post(row, *, liked: bool = False, author: dict | None = None) -> dict:
    return {
        "id": str(row[0]),
        "book_id": str(row[1]),
        "user_id": str(row[2]),
        "kind": row[3],
        "ref": row[4],
        "body": row[5],
        "abstract": row[6],
        "visibility": row[7],
        "section_id": row[8],
        "page_index": row[9],
        "span_start": row[10],
        "span_end": row[11],
        "read_status": row[12],
        "likes_count": int(row[13] or 0),
        "replies_count": int(row[14] or 0),
        "created_at": row[15].isoformat() if row[15] else None,
        "updated_at": row[16].isoformat() if row[16] else None,
        "liked": liked,
        "author": author or {"id": str(row[2]), "name": "读者"},
    }


def _serialize_reply(row, author: dict | None = None) -> dict:
    return {
        "id": str(row[0]),
        "post_id": str(row[1]),
        "user_id": str(row[2]),
        "body": row[3],
        "created_at": row[4].isoformat() if row[4] else None,
        "author": author or {"id": str(row[2]), "name": "读者"},
    }


def _ensure_book(conn, book_id: str) -> None:
    row = conn.execute(
        "SELECT id FROM shelf_platform_book WHERE id = %s AND status = 'published'",
        (book_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="书目不存在")


def list_posts(
    pool,
    book_id: str,
    *,
    kind: str | None = None,
    section_id: str | None = None,
    viewer_id: str | None = None,
    mine_only: bool = False,
    sort: str = "latest",
    limit: int = 50,
    offset: int = 0,
) -> dict:
    if kind and kind not in KIND:
        raise HTTPException(status_code=400, detail="无效类型")
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    with pool.connection() as conn:
        _ensure_book(conn, book_id)
        sql = (
            "SELECT p.id, p.book_id, p.user_id, p.kind, p.ref, p.body, p.abstract, "
            "p.visibility, p.section_id, p.page_index, p.span_start, p.span_end, "
            "p.read_status, p.likes_count, p.replies_count, p.created_at, p.updated_at "
            "FROM shelf_post p WHERE p.book_id = %s"
        )
        params: list[Any] = [book_id]
        if kind:
            sql += " AND p.kind = %s"
            params.append(kind)
        if section_id:
            sql += " AND p.section_id = %s"
            params.append(section_id)
        if mine_only:
            if not viewer_id:
                raise HTTPException(status_code=401, detail="未认证")
            sql += " AND p.user_id = %s"
            params.append(viewer_id)
        else:
            # 非「我的」：只返回 viewer 可见的公开/好友帖
            if viewer_id:
                sql += (
                    " AND (p.visibility = 'public' "
                    "OR (p.visibility = 'friends' AND ("
                    "p.user_id = %s OR EXISTS ("
                    "SELECT 1 FROM friendship f WHERE f.user_id = %s AND f.friend_id = p.user_id"
                    ")))"
                    "OR (p.visibility = 'private' AND p.user_id = %s))"
                )
                params.extend([viewer_id, viewer_id, viewer_id])
            else:
                sql += " AND p.visibility = 'public'"
        if sort == "helpful":
            sql += " ORDER BY p.likes_count DESC, p.created_at DESC"
        else:
            sql += " ORDER BY p.created_at DESC"
        sql += " LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        rows = conn.execute(sql, params).fetchall()
        liked_ids: set[str] = set()
        if viewer_id and rows:
            ids = [str(r[0]) for r in rows]
            placeholders = ",".join(["%s"] * len(ids))
            liked_rows = conn.execute(
                f"SELECT post_id FROM shelf_post_like WHERE user_id = %s AND post_id IN ({placeholders})",
                [viewer_id, *ids],
            ).fetchall()
            liked_ids = {str(r[0]) for r in liked_rows}
        items = []
        for row in rows:
            pid = str(row[0])
            author = _author_row(conn, str(row[2]))
            items.append(_serialize_post(row, liked=pid in liked_ids, author=author))
        counts = conn.execute(
            "SELECT kind, count(*) FROM shelf_post WHERE book_id = %s AND visibility = 'public' GROUP BY kind",
            (book_id,),
        ).fetchall()
        stats = {"reviews": 0, "notes": 0}
        for r in counts:
            if r[0] == "review":
                stats["reviews"] = int(r[1])
            elif r[0] == "note":
                stats["notes"] = int(r[1])
        return {"items": items, "stats": stats}


def get_post(pool, book_id: str, post_id: str, viewer_id: str | None) -> dict:
    with pool.connection() as conn:
        _ensure_book(conn, book_id)
        row = conn.execute(
            "SELECT p.id, p.book_id, p.user_id, p.kind, p.ref, p.body, p.abstract, "
            "p.visibility, p.section_id, p.page_index, p.span_start, p.span_end, "
            "p.read_status, p.likes_count, p.replies_count, p.created_at, p.updated_at "
            "FROM shelf_post p WHERE p.id = %s AND p.book_id = %s",
            (post_id, book_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="内容不存在")
        author_id = str(row[2])
        if not _can_view_post(conn, visibility=row[7], author_id=author_id, viewer_id=viewer_id):
            raise HTTPException(status_code=404, detail="内容不存在")
        liked = False
        if viewer_id:
            lr = conn.execute(
                "SELECT 1 FROM shelf_post_like WHERE post_id = %s AND user_id = %s",
                (post_id, viewer_id),
            ).fetchone()
            liked = lr is not None
        author = _author_row(conn, author_id)
        post = _serialize_post(row, liked=liked, author=author)
        reply_rows = conn.execute(
            "SELECT id, post_id, user_id, body, created_at FROM shelf_post_reply "
            "WHERE post_id = %s ORDER BY created_at ASC",
            (post_id,),
        ).fetchall()
        replies = []
        for rr in reply_rows:
            replies.append(_serialize_reply(rr, author=_author_row(conn, str(rr[2]))))
        post["replies"] = replies
        return post


def create_post(
    pool,
    book_id: str,
    user_id: str,
    *,
    kind: str,
    ref: str,
    body: str,
    abstract: str | None = None,
    visibility: str = "public",
    section_id: str | None = None,
    page_index: int | None = None,
    span_start: int | None = None,
    span_end: int | None = None,
    read_status: str | None = None,
) -> dict:
    if kind not in KIND:
        raise HTTPException(status_code=400, detail="无效类型")
    if visibility not in VISIBILITY:
        raise HTTPException(status_code=400, detail="无效可见范围")
    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="内容不能为空")
    if len(body) > MAX_BODY:
        raise HTTPException(status_code=400, detail=f"内容不超过 {MAX_BODY} 字")
    if read_status and read_status not in READ_STATUS:
        raise HTTPException(status_code=400, detail="无效阅读状态")
    with pool.connection() as conn:
        _ensure_book(conn, book_id)
        pid = str(uuid.uuid4())
        row = conn.execute(
            "INSERT INTO shelf_post (id, book_id, user_id, kind, ref, body, abstract, "
            "visibility, section_id, page_index, span_start, span_end, read_status) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "RETURNING id, book_id, user_id, kind, ref, body, abstract, visibility, "
            "section_id, page_index, span_start, span_end, read_status, "
            "likes_count, replies_count, created_at, updated_at",
            (
                pid,
                book_id,
                user_id,
                kind,
                ref.strip(),
                body,
                (abstract or "").strip() or None,
                visibility,
                section_id,
                page_index,
                span_start,
                span_end,
                read_status,
            ),
        ).fetchone()
        conn.commit()
        author = _author_row(conn, user_id)
        return _serialize_post(row, liked=False, author=author)


def update_post_visibility(
    pool,
    book_id: str,
    post_id: str,
    user_id: str,
    visibility: str,
) -> dict:
    if visibility not in VISIBILITY:
        raise HTTPException(status_code=400, detail="无效可见范围")
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT user_id FROM shelf_post WHERE id = %s AND book_id = %s",
            (post_id, book_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="内容不存在")
        if str(row[0]) != user_id:
            raise HTTPException(status_code=403, detail="无权修改")
        updated = conn.execute(
            "UPDATE shelf_post SET visibility = %s, updated_at = now() "
            "WHERE id = %s RETURNING id, book_id, user_id, kind, ref, body, abstract, "
            "visibility, section_id, page_index, span_start, span_end, read_status, "
            "likes_count, replies_count, created_at, updated_at",
            (visibility, post_id),
        ).fetchone()
        conn.commit()
        return _serialize_post(updated, author=_author_row(conn, user_id))


def delete_post(pool, book_id: str, post_id: str, user_id: str) -> dict:
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT user_id FROM shelf_post WHERE id = %s AND book_id = %s",
            (post_id, book_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="内容不存在")
        if str(row[0]) != user_id:
            raise HTTPException(status_code=403, detail="无权删除")
        conn.execute("DELETE FROM shelf_post WHERE id = %s", (post_id,))
        conn.commit()
        return {"ok": True}


def add_reply(
    pool,
    book_id: str,
    post_id: str,
    user_id: str,
    body: str,
) -> dict:
    body = (body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="回复不能为空")
    if len(body) > MAX_REPLY:
        raise HTTPException(status_code=400, detail=f"回复不超过 {MAX_REPLY} 字")
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT user_id, visibility FROM shelf_post WHERE id = %s AND book_id = %s",
            (post_id, book_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="内容不存在")
        if not _can_view_post(
            conn, visibility=row[1], author_id=str(row[0]), viewer_id=user_id
        ):
            raise HTTPException(status_code=404, detail="内容不存在")
        rid = str(uuid.uuid4())
        reply_row = conn.execute(
            "INSERT INTO shelf_post_reply (id, post_id, user_id, body) "
            "VALUES (%s, %s, %s, %s) "
            "RETURNING id, post_id, user_id, body, created_at",
            (rid, post_id, user_id, body),
        ).fetchone()
        conn.execute(
            "UPDATE shelf_post SET replies_count = replies_count + 1, updated_at = now() WHERE id = %s",
            (post_id,),
        )
        conn.commit()
        return _serialize_reply(reply_row, author=_author_row(conn, user_id))


def toggle_like(
    pool,
    book_id: str,
    post_id: str,
    user_id: str,
) -> dict:
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT user_id, visibility, likes_count FROM shelf_post WHERE id = %s AND book_id = %s",
            (post_id, book_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="内容不存在")
        if not _can_view_post(
            conn, visibility=row[1], author_id=str(row[0]), viewer_id=user_id
        ):
            raise HTTPException(status_code=404, detail="内容不存在")
        existing = conn.execute(
            "SELECT 1 FROM shelf_post_like WHERE post_id = %s AND user_id = %s",
            (post_id, user_id),
        ).fetchone()
        if existing:
            conn.execute(
                "DELETE FROM shelf_post_like WHERE post_id = %s AND user_id = %s",
                (post_id, user_id),
            )
            conn.execute(
                "UPDATE shelf_post SET likes_count = GREATEST(0, likes_count - 1) WHERE id = %s",
                (post_id,),
            )
            liked = False
        else:
            conn.execute(
                "INSERT INTO shelf_post_like (post_id, user_id) VALUES (%s, %s)",
                (post_id, user_id),
            )
            conn.execute(
                "UPDATE shelf_post SET likes_count = likes_count + 1 WHERE id = %s",
                (post_id,),
            )
            liked = True
        count_row = conn.execute(
            "SELECT likes_count FROM shelf_post WHERE id = %s",
            (post_id,),
        ).fetchone()
        conn.commit()
        return {"liked": liked, "likes_count": int(count_row[0] if count_row else 0)}


def section_public_notes(
    pool,
    book_id: str,
    section_id: str,
    viewer_id: str | None,
) -> dict:
    """阅读器内公开笔记锚点（flow 虚线）。"""
    with pool.connection() as conn:
        _ensure_book(conn, book_id)
        sql = (
            "SELECT p.id, p.book_id, p.user_id, p.kind, p.ref, p.body, p.abstract, "
            "p.visibility, p.section_id, p.page_index, p.span_start, p.span_end, "
            "p.read_status, p.likes_count, p.replies_count, p.created_at, p.updated_at "
            "FROM shelf_post p WHERE p.book_id = %s AND p.section_id = %s AND p.kind = 'note' "
            "AND p.span_start IS NOT NULL AND p.span_end IS NOT NULL"
        )
        params: list[Any] = [book_id, section_id]
        if viewer_id:
            sql += (
                " AND (p.visibility = 'public' "
                "OR (p.visibility = 'friends' AND ("
                "p.user_id = %s OR EXISTS ("
                "SELECT 1 FROM friendship f WHERE f.user_id = %s AND f.friend_id = p.user_id"
                ")))"
                "OR (p.visibility = 'private' AND p.user_id = %s))"
            )
            params.extend([viewer_id, viewer_id, viewer_id])
        else:
            sql += " AND p.visibility = 'public'"
        sql += " ORDER BY p.created_at DESC"
        rows = conn.execute(sql, params).fetchall()
        items = []
        for row in rows:
            author = _author_row(conn, str(row[2]))
            items.append(_serialize_post(row, author=author))
        return {"items": items}
