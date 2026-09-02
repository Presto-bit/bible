"""文件种子：无 PG 或库空时读取 data/shelf/platform_catalog.json。"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[4]
CATALOG_PATH = REPO_ROOT / "data" / "shelf" / "platform_catalog.json"


@lru_cache
def load_file_catalog() -> list[dict[str, Any]]:
    if not CATALOG_PATH.is_file():
        return []
    try:
        raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        items = raw.get("items") or []
        return [i for i in items if isinstance(i, dict)]
    except Exception:
        logger.exception("load_file_catalog failed")
        return []


def get_file_book(book_id: str) -> dict[str, Any] | None:
    for b in load_file_catalog():
        if str(b.get("id")) == book_id:
            return b
    return None
