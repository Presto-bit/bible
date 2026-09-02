"""书架业务：入库、列表、阅读。"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import HTTPException

from ..db import get_pool
from .assets import book_asset_keys, asset_allowed, infer_section_attachments
from .docx_parse import docx_bytes_to_prose_html, file_sha256, parse_docx_bytes
from .file_catalog import (
    DEFAULT_GROUPS,
    get_file_book,
    load_catalog_document,
    load_file_catalog,
    load_file_groups,
    save_catalog_document,
)
from .schema import ensure_shelf_schema
from .store import read_shelf_bytes, save_shelf_bytes, shelf_file_path

# 书目章节内存索引，避免每次按 id 线性扫描全书 sections
_sections_by_book: dict[str, dict[str, dict[str, Any]]] = {}


def _index_sections(book_id: str, sections: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    cached = _sections_by_book.get(book_id)
    if cached is not None and len(cached) == len(sections):
        return cached
    indexed = {str(s["id"]): s for s in sections if s.get("id")}
    _sections_by_book[book_id] = indexed
    return indexed


def _load_book_sections(book_id: str) -> dict[str, dict[str, Any]] | None:
    cached = _sections_by_book.get(book_id)
    if cached is not None:
        return cached

    fb = get_file_book(book_id)
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
        if not fb:
            return None
        sections = fb.get("sections") or []
    elif fb and (fb.get("book_type") == "collection" or fb.get("kind") == "collection"):
        # 教案合集以文件 catalog 为准（含 PDF/DOCX 课节与附件）
        sections = fb.get("sections") or sections
    return _index_sections(book_id, sections)


def invalidate_shelf_section_cache(book_id: str | None = None) -> None:
    if book_id:
        _sections_by_book.pop(book_id, None)
    else:
        _sections_by_book.clear()


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
            "book_type": b.get("book_type") or "document",
            "group_id": b.get("group_id") or "default",
            "created_at": None,
            "source": "platform",
        }
        for b in load_file_catalog()
        if (b.get("status") or "published") == "published"
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


def _merge_file_catalog(db_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """DB 有数据时也合并 platform_catalog.json 中的书目（如教案合集）。"""
    by_id = {str(i["id"]): i for i in db_items}
    for fi in _list_from_file():
        fid = str(fi["id"])
        if fid not in by_id:
            by_id[fid] = fi
    merged = list(by_id.values())
    merged.sort(key=lambda b: int(b.get("sort_order") or 0), reverse=True)
    return merged


def list_platform_books() -> list[dict[str, Any]]:
    file_items = _list_from_file()
    if not _db_available():
        return file_items
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
            return _merge_file_catalog([_row_to_summary(r) for r in rows])
    except Exception:
        pass
    return file_items


def list_platform_groups() -> list[dict[str, Any]]:
    return load_file_groups()


def list_platform_shelf() -> dict[str, Any]:
    items = list_platform_books()
    items.sort(key=lambda b: int(b.get("sort_order") or 0), reverse=True)
    return {"groups": list_platform_groups(), "items": items}


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
        "book_type": fb.get("book_type") or "document",
        "source": "platform",
        "created_at": None,
    }
    if include_sections:
        out["sections"] = [
            {
                "id": s["id"],
                "title": s["title"],
                "zone": s.get("zone"),
                "level": s.get("level"),
                "kind": s.get("kind") or "html",
                "unit": s.get("unit"),
            }
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
                    "book_type": "document",
                    "source": "platform",
                    "created_at": row[12].isoformat() if row[12] else None,
                }
                if fb and fb.get("book_type") == "collection":
                    return _book_detail_from_file(fb, include_sections=include_sections)
                if include_sections:
                    out["sections"] = [
                        {
                            "id": s["id"],
                            "title": s["title"],
                            "zone": s.get("zone"),
                            "level": s.get("level"),
                            "kind": s.get("kind") or "html",
                            "unit": s.get("unit"),
                        }
                        for s in sections
                    ]
                if fb:
                    out["group_id"] = fb.get("group_id")
                    out["book_type"] = fb.get("book_type") or out["book_type"]
                return out
        except Exception:
            pass
    if fb:
        if (fb.get("status") or "published") != "published":
            raise HTTPException(status_code=404, detail="书目不存在")
        return _book_detail_from_file(fb, include_sections=include_sections)
    raise HTTPException(status_code=404, detail="书目不存在")


def get_platform_section(book_id: str, section_id: str) -> dict[str, Any]:
    indexed = _load_book_sections(book_id)
    if indexed is None:
        raise HTTPException(status_code=404, detail="书目不存在")
    s = indexed.get(section_id)
    if not s:
        raise HTTPException(status_code=404, detail="章节不存在")
    kind = s.get("kind") or "html"
    html = s.get("html") or ""
    primary = s.get("primary")
    if not (html or "").strip() and primary:
        sk = str(primary.get("storage_key") or "")
        mime = str(primary.get("mime") or "")
        if "wordprocessingml" in mime or sk.lower().endswith(".docx"):
            try:
                path = get_platform_asset_path(book_id, sk.split("/")[-1])
                html = docx_bytes_to_prose_html(path.read_bytes())
            except Exception:
                html = html or ""
    return {
        "id": s["id"],
        "title": s.get("title") or "",
        "zone": s.get("zone"),
        "level": s.get("level"),
        "kind": kind,
        "unit": s.get("unit"),
        "html": html,
        "primary": primary,
        "attachments": infer_section_attachments(s),
    }


def get_platform_asset_path(book_id: str, storage_key: str):
    fb = get_file_book(book_id)
    if not fb:
        raise HTTPException(status_code=404, detail="书目不存在")
    name = storage_key.split("/")[-1]
    if not asset_allowed(fb, name):
        raise HTTPException(status_code=404, detail="文件不存在")
    path = shelf_file_path(name)
    if not path.is_file():
        raise FileNotFoundError(name)
    return path


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


def _find_catalog_book(doc: dict[str, Any], book_id: str) -> dict[str, Any] | None:
    for item in doc.get("items") or []:
        if isinstance(item, dict) and str(item.get("id")) == book_id:
            return item
    return None


def update_platform_book_meta(
    book_id: str,
    *,
    title: str | None = None,
    group_id: str | None = None,
    sort_order: int | None = None,
) -> dict[str, Any]:
    doc = load_catalog_document()
    book = _find_catalog_book(doc, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="书目不存在")
    if title is not None:
        t = title.strip()
        if not t:
            raise HTTPException(status_code=400, detail="书名不能为空")
        book["title"] = t
    if group_id is not None:
        gid = group_id.strip()
        group_ids = {str(g.get("id")) for g in (doc.get("groups") or []) if isinstance(g, dict)}
        if gid and gid not in group_ids:
            raise HTTPException(status_code=400, detail="分组不存在")
        book["group_id"] = gid or "default"
    if sort_order is not None:
        book["sort_order"] = int(sort_order)
    save_catalog_document(doc)
    invalidate_shelf_section_cache(book_id)
    return {"ok": True, "id": book_id, "title": book.get("title"), "group_id": book.get("group_id")}


def archive_platform_book(book_id: str) -> dict[str, Any]:
    doc = load_catalog_document()
    book = _find_catalog_book(doc, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="书目不存在")
    book["status"] = "archived"
    save_catalog_document(doc)
    invalidate_shelf_section_cache(book_id)
    return {"ok": True, "id": book_id, "status": "archived"}


def create_shelf_group(title: str, *, sort_order: int = 50) -> dict[str, Any]:
    t = title.strip()
    if not t:
        raise HTTPException(status_code=400, detail="分组名不能为空")
    doc = load_catalog_document()
    groups = doc.setdefault("groups", list(DEFAULT_GROUPS))
    gid = f"grp-{uuid.uuid4().hex[:8]}"
    entry = {"id": gid, "title": t, "sort_order": int(sort_order)}
    groups.append(entry)
    save_catalog_document(doc)
    return entry


def update_shelf_group(group_id: str, *, title: str | None = None, sort_order: int | None = None) -> dict[str, Any]:
    doc = load_catalog_document()
    groups = doc.get("groups") or []
    hit = None
    for g in groups:
        if isinstance(g, dict) and str(g.get("id")) == group_id:
            hit = g
            break
    if not hit:
        raise HTTPException(status_code=404, detail="分组不存在")
    if title is not None:
        t = title.strip()
        if not t:
            raise HTTPException(status_code=400, detail="分组名不能为空")
        hit["title"] = t
    if sort_order is not None:
        hit["sort_order"] = int(sort_order)
    save_catalog_document(doc)
    return hit
