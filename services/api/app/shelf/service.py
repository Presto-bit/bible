"""书架业务：入库、列表、阅读。"""
from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from ..db import get_pool
from .assets import book_asset_keys, asset_allowed, infer_section_attachments
from .docx_parse import docx_bytes_to_prose_html, file_sha256, parse_docx_bytes
from .html_normalize import inject_shelf_paragraph_anchors, normalize_section_html
from .file_catalog import (
    DEFAULT_GROUPS,
    get_file_book,
    load_catalog_document,
    load_file_catalog,
    load_file_groups,
    save_catalog_document,
)
from .schema import ensure_shelf_schema
from .store import read_shelf_bytes, shelf_dir, shelf_file_path

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


def platform_book_published(book_id: str, *, conn=None) -> bool:
    """书目已发布：PG 或文件种子（与 get_platform_book 一致）。"""
    if conn is not None:
        row = conn.execute(
            "SELECT id FROM shelf_platform_book WHERE id = %s AND status = 'published'",
            (book_id,),
        ).fetchone()
        if row:
            return True
    else:
        if _db_available():
            pool = get_pool()
            ensure_shelf_schema(pool)
            try:
                with pool.connection() as c:
                    row = c.execute(
                        "SELECT id FROM shelf_platform_book WHERE id = %s AND status = 'published'",
                        (book_id,),
                    ).fetchone()
                    if row:
                        return True
            except Exception:
                pass
    fb = get_file_book(book_id)
    return fb is not None and (fb.get("status") or "published") == "published"


def ensure_platform_book_row(conn, book_id: str) -> None:
    """发帖 FK 依赖 shelf_platform_book；文件种子书目 lazily 入库。"""
    row = conn.execute("SELECT id FROM shelf_platform_book WHERE id = %s", (book_id,)).fetchone()
    if row:
        return
    fb = get_file_book(book_id)
    if not fb or (fb.get("status") or "published") != "published":
        raise HTTPException(status_code=404, detail="书目不存在")
    toc = fb.get("toc") or {}
    sections = fb.get("sections") or []
    conn.execute(
        """
        INSERT INTO shelf_platform_book (
          id, title, subtitle, author, mime, storage_key, file_size, file_sha256,
          toc_json, sections_json, status, sort_order
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,'published',%s)
        ON CONFLICT (id) DO NOTHING
        """,
        (
            book_id,
            fb.get("title") or "未命名",
            fb.get("subtitle"),
            fb.get("author"),
            fb.get("mime") or "application/octet-stream",
            fb.get("storage_key") or f"shelf-{book_id}",
            int(fb.get("file_size") or 0),
            fb.get("file_sha256"),
            json.dumps(toc, ensure_ascii=False),
            json.dumps(sections, ensure_ascii=False),
            int(fb.get("sort_order") or 0),
        ),
    )


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
                html = docx_bytes_to_prose_html(
                    path.read_bytes(),
                    book_id=book_id,
                    storage_key=sk.split("/")[-1],
                    use_cache=True,
                )
            except Exception:
                html = html or ""
    # 对话书等已入库纯文本：用 Mammoth 缓存升级
    elif (html or "").strip() and kind != "lesson" and "shelf-docx-root" not in html:
        try:
            fb = get_file_book(book_id)
            sk = str((fb or {}).get("storage_key") or "")
            if sk.lower().endswith(".docx"):
                from .convert_cache import read_meta_cache, write_meta_cache
                from .docx_parse import file_sha256, parse_docx_bytes
                from .store import read_shelf_bytes

                data = read_shelf_bytes(sk)
                sha = file_sha256(data)
                meta = read_meta_cache(sha)
                if not meta or not (meta.get("sections") or {}).get(section_id):
                    parsed = parse_docx_bytes(
                        data, book_id=book_id, storage_key=sk, enrich=True
                    )
                    meta = {
                        "sections": {
                            x["id"]: x.get("html") or ""
                            for x in (parsed.get("sections") or [])
                            if isinstance(x, dict)
                        }
                    }
                    write_meta_cache(sha, meta)
                rich = (meta.get("sections") or {}).get(section_id)
                if rich:
                    html = rich
        except Exception:
            pass
    lesson = kind == "lesson" or kind == "epub"
    if html.strip():
        html = normalize_section_html(html, kind=kind if kind != "epub" else "lesson", lesson=lesson)
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
    from .ingest import import_platform_file

    return import_platform_file(
        data,
        filename="book.docx",
        title=title,
        sort_order=sort_order,
        replace_sha256=replace_sha256,
    )


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


_LESSON_MIME = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}

_UNIT_DISPLAY = {
    "第一单元": "第一单元 · 创造与天地万物",
    "第二单元": "第二单元 · 奇妙的身体与家",
    "第三单元": "第三单元 · 耶稣的神迹与呼召",
    "第四单元": "第四单元 · 品格故事与服事",
    "第五单元": "第五单元 · 信心、勇气与守信",
    "第六单元": "第六单元 · 好牧人与小羊群",
}


def _safe_cur_stem(raw: str) -> str:
    """ASCII 安全 stem：中文/空格等收成 cur-xxxx，避免部分环境路径/URL 踩坑。"""
    s = re.sub(r"[^a-zA-Z0-9\-]+", "-", (raw or "").strip())
    s = re.sub(r"-{2,}", "-", s).strip("-").lower()
    if not s or s in {"doc", "docx", "pdf", "file", "blob", "document", "untitled"}:
        s = f"add-{uuid.uuid4().hex[:8]}"
    if not s.startswith("cur-"):
        s = f"cur-{s}"
    return s[:80]


def _title_from_filename(filename: str) -> str:
    stem = Path(filename or "教案").stem
    stem = re.sub(r"\s+", " ", stem).strip()
    if stem.lower() in {"file", "blob", "document", "untitled", "lesson", "doc", "docx", "pdf"}:
        return "新课节"
    return stem or "新课节"


_OLE_DOC_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def _resolve_lesson_suffix(
    filename: str,
    data: bytes,
    content_type: str | None = None,
) -> str:
    """从文件名 / MIME / 魔数判定课节后缀；兼容 iOS 无后缀文件名。"""
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".pdf", ".docx"}:
        return suffix
    if suffix == ".doc":
        raise HTTPException(
            status_code=400,
            detail="暂不支持旧版 Word（.doc），请另存为 .docx 后再上传",
        )

    head = data[:8] if data else b""
    if head.startswith(b"%PDF"):
        return ".pdf"
    if head.startswith(b"PK"):
        return ".docx"
    if head.startswith(_OLE_DOC_MAGIC):
        raise HTTPException(
            status_code=400,
            detail="暂不支持旧版 Word（.doc），请另存为 .docx 后再上传",
        )

    ct = (content_type or "").lower()
    if "pdf" in ct:
        return ".pdf"
    if "wordprocessingml" in ct or "officedocument.wordprocessingml" in ct:
        return ".docx"
    if "msword" in ct:
        raise HTTPException(
            status_code=400,
            detail="暂不支持旧版 Word（.doc），请另存为 .docx 后再上传",
        )

    raise HTTPException(
        status_code=400,
        detail="课节正文仅支持 .pdf / .docx（请确认扩展名，或用 Word「另存为」docx）",
    )


def collection_units(book_id: str) -> list[str]:
    book = get_file_book(book_id)
    if not book:
        return []
    units: list[str] = []
    seen: set[str] = set()
    for sec in book.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        u = (sec.get("unit") or "").strip()
        if u and u not in seen:
            seen.add(u)
            units.append(u)
    for item in (book.get("toc") or {}).get("body") or []:
        if not isinstance(item, dict):
            continue
        if item.get("source") == "unit":
            title = str(item.get("title") or "")
            # "第一单元 · …" → "第一单元"
            u = title.split("·", 1)[0].strip() or title.strip()
            if u and u not in seen:
                seen.add(u)
                units.append(u)
    return units


def append_collection_lesson(
    book_id: str,
    *,
    data: bytes,
    filename: str,
    title: str | None = None,
    unit: str | None = None,
    zone: str = "body",
    after_section_id: str | None = None,
    attachments: list[tuple[bytes, str]] | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    """向合集书追加一课（写 uploads + platform_catalog.json）。"""
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件过大（上限 50MB）")
    if len(data) < 16:
        raise HTTPException(status_code=400, detail="文件无效或为空")

    suffix = _resolve_lesson_suffix(filename, data, content_type)

    z = (zone or "body").strip().lower()
    if z not in {"front", "body", "appendix"}:
        raise HTTPException(status_code=400, detail="zone 无效")

    doc = load_catalog_document()
    book = _find_catalog_book(doc, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="书目不存在")
    if (book.get("book_type") or book.get("kind") or "") != "collection":
        raise HTTPException(status_code=400, detail="仅合集书可追加课节")

    display_title = (title or "").strip() or _title_from_filename(filename)
    unit_name = (unit or "").strip() or None
    # 存储键只用 ASCII，标题仍用用户文案
    stem = _safe_cur_stem(Path(filename).stem or display_title)
    storage_key = f"{stem}{suffix}"
    dest = shelf_dir() / storage_key
    if dest.exists():
        storage_key = f"{stem}-{uuid.uuid4().hex[:4]}{suffix}"
        stem = Path(storage_key).stem
        dest = shelf_dir() / storage_key
    try:
        dest.write_bytes(data)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"写入文件失败：{e}") from e

    sec_id = f"sec-{stem}"
    sections = book.setdefault("sections", [])
    if any(isinstance(s, dict) and str(s.get("id")) == sec_id for s in sections):
        sec_id = f"sec-{stem}-{uuid.uuid4().hex[:4]}"

    att_list: list[dict[str, Any]] = []
    for att_bytes, att_name in attachments or []:
        if not att_bytes:
            continue
        att_suffix = Path(att_name or "").suffix.lower()
        if att_suffix not in _LESSON_MIME:
            continue
        if len(att_bytes) > 80 * 1024 * 1024:
            continue
        att_stem = f"{stem}-{_safe_cur_stem(Path(att_name).stem).removeprefix('cur-')}"
        att_key = f"{att_stem}{att_suffix}"
        att_path = shelf_dir() / att_key
        if att_path.exists():
            att_key = f"{att_stem}-{uuid.uuid4().hex[:4]}{att_suffix}"
            att_path = shelf_dir() / att_key
        try:
            att_path.write_bytes(att_bytes)
        except OSError:
            continue
        kind = "video" if att_suffix in {".mp4", ".webm", ".mov"} else "image"
        att_list.append(
            {
                "id": f"att-{Path(att_key).stem}",
                "title": Path(att_name).stem or Path(att_key).stem,
                "kind": kind,
                "storage_key": att_key,
                "mime": _LESSON_MIME.get(att_suffix, "application/octet-stream"),
            }
        )

    primary_name = Path(filename or "").name
    if not primary_name or not Path(primary_name).suffix:
        primary_name = f"{display_title}{suffix}"

    section = {
        "id": sec_id,
        "title": display_title,
        "zone": z,
        "level": 2 if unit_name and z == "body" else 1,
        "kind": "lesson",
        "unit": unit_name,
        "primary": {
            "storage_key": storage_key,
            "mime": _LESSON_MIME.get(suffix, "application/octet-stream"),
            "title": primary_name,
        },
        "attachments": att_list,
    }
    sections.append(section)

    toc = book.setdefault("toc", {})
    zone_key = z if z in {"front", "body", "appendix"} else "body"
    toc_list: list[dict[str, Any]] = list(toc.get(zone_key) or [])
    toc_item = {
        "id": f"toc-{sec_id}",
        "title": display_title,
        "level": 2 if unit_name and z == "body" else 1,
        "zone": z,
        "source": "lesson",
        "section_id": sec_id,
    }

    insert_at = len(toc_list)
    if after_section_id:
        for i, item in enumerate(toc_list):
            if isinstance(item, dict) and str(item.get("section_id")) == after_section_id:
                insert_at = i + 1
                break

    if z == "body" and unit_name:
        unit_toc_id = f"unit-{unit_name}"
        has_unit = any(
            isinstance(it, dict) and (it.get("id") == unit_toc_id or it.get("source") == "unit" and str(it.get("title", "")).startswith(unit_name))
            for it in toc_list
        )
        if not has_unit:
            unit_item = {
                "id": unit_toc_id,
                "title": _UNIT_DISPLAY.get(unit_name, unit_name),
                "level": 1,
                "zone": "body",
                "source": "unit",
                "section_id": None,
            }
            # 插到同单元课之前：若 after 指向某课，unit 应在该课前已存在；否则插在课前
            toc_list.insert(insert_at, unit_item)
            insert_at += 1
        else:
            # 默认插到该单元最后一课之后
            last_in_unit = None
            in_unit = False
            for i, item in enumerate(toc_list):
                if not isinstance(item, dict):
                    continue
                if item.get("source") == "unit" and (
                    item.get("id") == unit_toc_id
                    or str(item.get("title", "")).startswith(unit_name)
                ):
                    in_unit = True
                    last_in_unit = i
                    continue
                if in_unit and item.get("source") == "unit":
                    break
                if in_unit and item.get("source") == "lesson":
                    last_in_unit = i
            if after_section_id is None and last_in_unit is not None:
                insert_at = last_in_unit + 1

    toc_list.insert(insert_at, toc_item)
    toc[zone_key] = toc_list

    book["file_size"] = int(book.get("file_size") or 0) + len(data) + sum(len(a[0]) for a in (attachments or []))
    try:
        save_catalog_document(doc)
    except OSError as e:
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=f"写入目录失败：{e}") from e
    invalidate_shelf_section_cache(book_id)
    return {
        "ok": True,
        "book_id": book_id,
        "section": {
            "id": section["id"],
            "title": section["title"],
            "zone": section["zone"],
            "unit": section.get("unit"),
            "kind": section["kind"],
            "primary": section["primary"],
            "attachments": section["attachments"],
        },
    }
