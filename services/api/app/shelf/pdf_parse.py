"""单本 PDF 入库：整文件一节，走 page 阅读器。"""
from __future__ import annotations

from pathlib import Path
from typing import Any


def parse_pdf_bytes(
    data: bytes,
    *,
    storage_key: str,
    title_hint: str | None = None,
) -> dict[str, Any]:
    if len(data) < 8 or not data[:5].startswith(b"%PDF-"):
        raise ValueError("不是有效的 PDF 文件")

    stem = Path(storage_key).stem or "book"
    title = (title_hint or stem or "未命名").strip()
    sec_id = f"sec-{stem}"
    toc_entry = {
        "id": f"tb-{stem}",
        "title": title,
        "level": 1,
        "zone": "body",
        "source": "file",
        "confidence": 1.0,
        "section_id": sec_id,
    }
    section = {
        "id": sec_id,
        "title": title,
        "zone": "body",
        "level": 1,
        "kind": "lesson",
        "html": "",
        "primary": {
            "storage_key": storage_key,
            "mime": "application/pdf",
            "title": Path(storage_key).name,
        },
        "attachments": [],
    }
    return {
        "title": title,
        "subtitle": None,
        "author": None,
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
