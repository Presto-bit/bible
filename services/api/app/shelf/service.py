"""书架业务：入库、列表、阅读。"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import HTTPException

from ..db import get_pool
from .docx_parse import file_sha256, parse_docx_bytes
from .file_catalog import get_file_book, load_file_catalog
from .schema import ensure_shelf_schema
from .store import read_shelf_bytes, save_shelf_bytes


def _db_available() -> bool:
    try:
        pool = get_pool()
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


def _list_from_file() -> list[dict[str, Any]]:
    return [
        {
            "id": b["id"],
            "title": b.get("title") or "",
            "subtitle": b.get("subtitle") or "",
            "author": b.get("author") or "",
            "mime": b.get("mime") or "",
            "file_size": int(b.get("file_size") or 0),
            "status": b.get("status") or "published",
            "sort_order": int(b.get("sort_order") or 0),
            "section_count": len(b.get("sections") or []),
            "created_at": None,
            "source": "platform",
        }
        for b in load_file_catalog()
    ]


def _row_to_summary(row: tuple) -> dict[str, Any]:
    (
        bid,
        title,
        subtitle,
        author,
        mime,
        file_size,
        toc_json,
        status,
        sort_order,
        created_at,
    ) = row
    toc = toc_json if isinstance(toc_json, dict) else json.loads(toc_json or "{}")
    section_count = len(toc.get("body") or []) + len(toc.get("appendix") or [])
    return {
        "id": str(bid),
        "title": title,
        "subtitle": subtitle or "",
        "author": author or "",
        "mime": mime,
        "file_size": int(file_size or 0),
        "status": status,
        "sort_order": sort_order,
        "section_count": section_count,
        "created_at": created_at.isoformat() if created_at else None,
        "source": "platform",
    }


def list_platform_books() -> list[dict[str, Any]]:
    if not _db_available():
        return _list_from_file()
    pool = get_pool()
    ensure_shelf_schema(pool)
    try:
        with pool.connection() as conn:
            cur = conn.execute(
                """
                SELECT id, title, subtitle, author, mime, file_size, toc_json, status, sort_order, created_at
                FROM shelf_platform_book
                WHERE status = 'published'
                ORDER BY sort_order DESC, created_at DESC
                """
            )
            rows = cur.fetchall()
        if rows:
            return [_row_to_summary(r) for r in rows]
    except Exception:
        pass
    return _list_from_file()


def _book_detail_from_file(fb: dict[str, Any], *, include_sections: bool) -> dict[str, Any]:
    out = {
        "id": fb["id"],
        "title": fb.get("title") or "",
        "subtitle": fb.get("subtitle") or "",
        "author": fb.get("author") or "",
        "mime": fb.get("mime") or "",
        "file_size": int(fb.get("file_size") or 0),
        "file_sha256": fb.get("file_sha256"),
        "toc": fb.get("toc") or {},
        "status": fb.get("status") or "published",
        "source": "platform",
        "created_at": None,
    }
    if include_sections:
        out["sections"] = [
            {"id": s["id"], "title": s["title"], "zone": s.get("zone"), "level": s.get("level")}
            for s in (fb.get("sections") or [])
        ]
    return out


def get_platform_book(book_id: str, *, include_sections: bool = False) -> dict[str, Any]:
    fb = get_file_book(book_id)
    if _db_available():
        pool = get_pool()
        ensure_shelf_schema(pool)
        try:
            with pool.connection() as conn:
                cur = conn.execute(
                    """
                    SELECT id, title, subtitle, author, mime, storage_key, file_size, file_sha256,
                           toc_json, sections_json, status, sort_order, created_at
                    FROM shelf_platform_book
                    WHERE id = %s AND status = 'published'
                    """,
                    (book_id,),
                )
                row = cur.fetchone()
            if row:
                toc = row[8] if isinstance(row[8], dict) else json.loads(row[8] or "{}")
                sections = row[9] if isinstance(row[9], list) else json.loads(row[9] or "[]")
                out = {
                    "id": str(row[0]),
                    "title": row[1],
                    "subtitle": row[2] or "",
                    "author": row[3] or "",
                    "mime": row[4],
                    "file_size": int(row[6] or 0),
                    "file_sha256": row[7],
                    "toc": toc,
                    "status": row[10],
                    "source": "platform",
                    "created_at": row[12].isoformat() if row[12] else None,
                }
                if include_sections:
                    out["sections"] = [
                        {"id": s["id"], "title": s["title"], "zone": s.get("zone"), "level": s.get("level")}
                        for s in sections
                    ]
                return out
        except Exception:
            pass
    if fb:
        return _book_detail_from_file(fb, include_sections=include_sections)
    raise HTTPException(status_code=404, detail="书目不存在")


def get_platform_section(book_id: str, section_id: str) -> dict[str, Any]:
    sections: list[dict[str, Any]] | None = None
    if _db_available():
        try:
            pool = get_pool()
            with pool.connection() as conn:
                cur = conn.execute(
                    "SELECT sections_json FROM shelf_platform_book WHERE id = %s AND status = 'published'",
                    (book_id,),
                )
                row = cur.fetchone()
            if row:
                sections = row[0] if isinstance(row[0], list) else json.loads(row[0] or "[]")
        except Exception:
            sections = None
    if sections is None:
        fb = get_file_book(book_id)
        if not fb:
            raise HTTPException(status_code=404, detail="书目不存在")
        sections = fb.get("sections") or []
    for s in sections:
        if s.get("id") == section_id:
            return {
                "id": s["id"],
                "title": s.get("title") or "",
                "zone": s.get("zone"),
                "level": s.get("level"),
                "html": s.get("html") or "",
            }
    raise HTTPException(status_code=404, detail="章节不存在")


def get_platform_file_bytes(book_id: str) -> tuple[bytes, str, str]:
    if _db_available():
        try:
            pool = get_pool()
            with pool.connection() as conn:
                cur = conn.execute(
                    "SELECT storage_key, mime, title FROM shelf_platform_book WHERE id = %s AND status = 'published'",
                    (book_id,),
                )
                row = cur.fetchone()
            if row:
                data = read_shelf_bytes(row[0])
                return data, row[1] or "application/octet-stream", row[2] or "book"
        except Exception:
            pass
    fb = get_file_book(book_id)
    if not fb:
        raise HTTPException(status_code=404, detail="书目不存在")
    data = read_shelf_bytes(fb.get("storage_key") or "")
    return data, fb.get("mime") or "application/octet-stream", fb.get("title") or "book"


def import_platform_docx(
    data: bytes,
    *,
    title: str | None = None,
    sort_order: int = 0,
    replace_sha256: str | None = None,
) -> dict[str, Any]:
    sha = file_sha256(data)
    pool = get_pool()
    ensure_shelf_schema(pool)

    if replace_sha256:
        with pool.connection() as conn:
            cur = conn.execute(
                "SELECT id FROM shelf_platform_book WHERE file_sha256 = %s LIMIT 1",
                (replace_sha256,),
            )
            old = cur.fetchone()
            if old:
                conn.execute("DELETE FROM shelf_platform_book WHERE id = %s", (old[0],))
                conn.commit()

    with pool.connection() as conn:
        cur = conn.execute(
            "SELECT id FROM shelf_platform_book WHERE file_sha256 = %s LIMIT 1",
            (sha,),
        )
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="相同文件已入库")

    parsed = parse_docx_bytes(data)
    book_title = (title or parsed.get("title") or "未命名").strip()
    storage_key = save_shelf_bytes(data, suffix=".docx")
    book_id = str(uuid.uuid4())
    toc = parsed.get("toc") or {}
    sections = parsed.get("sections") or []

    with pool.connection() as conn:
        conn.execute(
            """
            INSERT INTO shelf_platform_book (
              id, title, subtitle, author, mime, storage_key, file_size, file_sha256,
              toc_json, sections_json, status, sort_order
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,'published',%s)
            """,
            (
                book_id,
                book_title,
                parsed.get("subtitle"),
                parsed.get("author"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                storage_key,
                len(data),
                sha,
                json.dumps(toc, ensure_ascii=False),
                json.dumps(sections, ensure_ascii=False),
                sort_order,
            ),
        )
        conn.commit()

    return {
        "id": book_id,
        "title": book_title,
        "section_count": len(sections),
        "file_sha256": sha,
        "storage_key": storage_key,
    }
