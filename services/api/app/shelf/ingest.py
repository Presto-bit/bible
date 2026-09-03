"""统一入库：docx / md / txt / epub / mobi。"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from ..db import get_pool
from .convert_cache import write_meta_cache
from .docx_parse import file_sha256, parse_docx_bytes
from .epub_parse import EpubError, parse_epub_bytes, try_convert_mobi_to_epub
from .md_parse import parse_markdown_bytes
from .schema import ensure_shelf_schema
from .store import save_shelf_bytes
from .txt_parse import parse_txt_bytes

_FLOW_SUFFIXES = {".docx", ".md", ".markdown", ".txt", ".epub", ".mobi", ".azw", ".azw3"}


def sniff_suffix(filename: str) -> str:
    return Path(filename or "").suffix.lower()


def import_platform_file(
    data: bytes,
    *,
    filename: str,
    title: str | None = None,
    sort_order: int = 0,
    replace_sha256: str | None = None,
) -> dict[str, Any]:
    suffix = sniff_suffix(filename)
    if suffix not in _FLOW_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"暂不支持 {suffix or '该格式'}（支持 .docx .md .txt .epub；.mobi 需可转 EPUB）",
        )

    # MOBI → EPUB
    if suffix in {".mobi", ".azw", ".azw3"}:
        try:
            data = try_convert_mobi_to_epub(data, filename=filename)
            suffix = ".epub"
            filename = Path(filename).with_suffix(".epub").name
        except EpubError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

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

    book_id = str(uuid.uuid4())
    storage_key = save_shelf_bytes(data, suffix=suffix)

    mime = {
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".md": "text/markdown",
        ".markdown": "text/markdown",
        ".txt": "text/plain",
        ".epub": "application/epub+zip",
    }.get(suffix, "application/octet-stream")

    try:
        if suffix == ".docx":
            parsed = parse_docx_bytes(data, book_id=book_id, storage_key=storage_key, enrich=True)
        elif suffix in {".md", ".markdown"}:
            parsed = parse_markdown_bytes(
                data, book_id=book_id, storage_key=storage_key, title_hint=title
            )
        elif suffix == ".txt":
            parsed = parse_txt_bytes(data, title_hint=title)
        elif suffix == ".epub":
            parsed = parse_epub_bytes(
                data, book_id=book_id, storage_key=storage_key, title_hint=title
            )
        else:
            raise HTTPException(400, "不支持的格式")
    except EpubError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"解析失败：{e}") from e

    book_title = (title or parsed.get("title") or Path(filename).stem or "未命名").strip()
    toc = parsed.get("toc") or {}
    sections = parsed.get("sections") or []

    # 章节 HTML 缓存，供阅读升级
    write_meta_cache(
        sha,
        {
            "sections": {s["id"]: s.get("html") or "" for s in sections if isinstance(s, dict)},
            "variant": parsed.get("variant") or ("docx" if suffix == ".docx" else suffix.lstrip(".")),
            "needs_toc_confirm": bool(parsed.get("needs_toc_confirm")),
        },
    )

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
                mime,
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
        "mime": mime,
        "needs_toc_confirm": bool(parsed.get("needs_toc_confirm")),
        "preview": {
            "toc_outline": (toc.get("outline") or toc.get("body") or [])[:12],
            "first_html": (sections[0].get("html") if sections else "")[:4000],
        },
    }
