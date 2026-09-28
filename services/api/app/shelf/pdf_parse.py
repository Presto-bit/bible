"""单本 PDF 入库：优先读书签切节；无书签则整文件一节。阅读走 page 模式。"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

# 存储键 stem：shelf-{uuid hex}，禁止当作用户可见书名/目录名
_STORAGE_STEM_RE = re.compile(r"^shelf-[0-9a-f]{8,}$", re.IGNORECASE)


def is_internal_shelf_label(raw: str | None) -> bool:
    t = (raw or "").strip()
    if not t:
        return True
    stem = Path(t).stem if "." in t else t
    return bool(_STORAGE_STEM_RE.match(stem))


def human_pdf_title(*candidates: str | None, fallback: str = "未命名") -> str:
    for raw in candidates:
        t = (raw or "").replace("\x00", "").strip()
        t = " ".join(t.split())
        if not t or is_internal_shelf_label(t):
            continue
        return t[:120]
    return fallback


def _single_section_book(
    *,
    storage_key: str,
    title: str,
    page_count: int | None = None,
    author: str | None = None,
) -> dict[str, Any]:
    stem = Path(storage_key).stem or "book"
    book_title = human_pdf_title(title, fallback="未命名")
    # 无书签时目录不要暴露存储键；单节统一展示「正文」
    section_title = "正文"
    sec_id = f"sec-{stem}"
    primary: dict[str, Any] = {
        "storage_key": storage_key,
        "mime": "application/pdf",
        "title": Path(storage_key).name,
    }
    if page_count is not None and page_count > 0:
        primary["page_start"] = 0
        primary["page_end"] = page_count - 1
    toc_entry = {
        "id": f"tb-{stem}",
        "title": section_title,
        "level": 1,
        "zone": "body",
        "source": "file",
        "confidence": 1.0,
        "section_id": sec_id,
    }
    section = {
        "id": sec_id,
        "title": section_title,
        "zone": "body",
        "level": 1,
        "kind": "lesson",
        "html": "",
        "primary": primary,
        "attachments": [],
    }
    return {
        "title": book_title,
        "subtitle": None,
        "author": author,
        "sections": [section],
        "section_count": 1,
        "toc": {
            "front": [],
            "body": [toc_entry],
            "outline": [toc_entry],
            "appendix": [],
        },
        "variant": "pdf",
        "needs_toc_confirm": False,
    }


def _clean_title(raw: str, *, fallback: str) -> str:
    return human_pdf_title(raw, fallback=fallback)


def _bookmark_entries(data: bytes) -> tuple[list[tuple[int, str, int]], int, str | None, str | None]:
    """返回 (level, title, page_1based) 列表、总页数、文档标题、作者。"""
    import fitz  # pymupdf

    doc = fitz.open(stream=data, filetype="pdf")
    try:
        page_count = int(doc.page_count or 0)
        meta = doc.metadata or {}
        doc_title = human_pdf_title(meta.get("title"), fallback="") or None
        doc_author = (meta.get("author") or "").strip() or None
        raw_toc = doc.get_toc(simple=True) or []
    finally:
        doc.close()

    entries: list[tuple[int, str, int]] = []
    seen_pages: set[int] = set()
    for item in raw_toc:
        if not isinstance(item, (list, tuple)) or len(item) < 3:
            continue
        try:
            level = int(item[0])
            page = int(item[2])
        except (TypeError, ValueError):
            continue
        title = _clean_title(str(item[1] or ""), fallback="")
        if not title or is_internal_shelf_label(title):
            continue
        if page < 1 or (page_count > 0 and page > page_count):
            continue
        # 同页连续书签合并为一条（避免空节）
        if page in seen_pages:
            continue
        seen_pages.add(page)
        entries.append((max(1, level), title, page))

    entries.sort(key=lambda e: (e[2], e[0]))
    return entries, page_count, doc_title, doc_author


def parse_pdf_bytes(
    data: bytes,
    *,
    storage_key: str,
    title_hint: str | None = None,
) -> dict[str, Any]:
    if len(data) < 8 or not data[:5].startswith(b"%PDF-"):
        raise ValueError("不是有效的 PDF 文件")

    stem = Path(storage_key).stem or "book"
    hint = human_pdf_title(title_hint, fallback="")

    try:
        entries, page_count, doc_title, doc_author = _bookmark_entries(data)
    except Exception:
        # PyMuPDF 不可用或损坏：回退整本一节
        return _single_section_book(
            storage_key=storage_key,
            title=hint or "未命名",
        )

    title = human_pdf_title(doc_title, hint, fallback="未命名")
    if not entries or page_count <= 0:
        return _single_section_book(
            storage_key=storage_key,
            title=title,
            page_count=page_count if page_count > 0 else None,
            author=doc_author,
        )

    # 文前：首页到第一条书签之前
    if entries[0][2] > 1:
        entries = [(1, "文前", 1), *entries]

    sections: list[dict[str, Any]] = []
    toc_body: list[dict[str, Any]] = []
    for i, (level, sec_title, start_1) in enumerate(entries):
        end_1 = entries[i + 1][2] - 1 if i + 1 < len(entries) else page_count
        if end_1 < start_1:
            end_1 = start_1
        sec_id = f"sec-{stem}-{i + 1}"
        toc_id = f"tb-{stem}-{i + 1}"
        page_start = start_1 - 1
        page_end = end_1 - 1
        toc_entry = {
            "id": toc_id,
            "title": sec_title,
            "level": level,
            "zone": "front" if sec_title == "文前" and i == 0 else "body",
            "source": "pdf_bookmark",
            "confidence": 1.0,
            "section_id": sec_id,
        }
        section = {
            "id": sec_id,
            "title": sec_title,
            "zone": toc_entry["zone"],
            "level": level,
            "kind": "lesson",
            "html": "",
            "primary": {
                "storage_key": storage_key,
                "mime": "application/pdf",
                "title": Path(storage_key).name,
                "page_start": page_start,
                "page_end": page_end,
            },
            "attachments": [],
        }
        sections.append(section)
        toc_body.append(toc_entry)

    front = [t for t in toc_body if t.get("zone") == "front"]
    body = [t for t in toc_body if t.get("zone") != "front"]
    return {
        "title": title,
        "subtitle": None,
        "author": doc_author,
        "sections": sections,
        "section_count": len(sections),
        "toc": {
            "front": front,
            "body": body,
            "outline": toc_body,
            "appendix": [],
        },
        "variant": "pdf",
        "needs_toc_confirm": False,
    }
