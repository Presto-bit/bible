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

DEFAULT_GROUPS: list[dict[str, Any]] = [
    {"id": "devotional", "title": "灵修", "sort_order": 100},
    {"id": "curriculum", "title": "教案", "sort_order": 90},
    {"id": "default", "title": "未分组", "sort_order": 0},
]


def load_catalog_document() -> dict[str, Any]:
    if not CATALOG_PATH.is_file():
        return {"groups": list(DEFAULT_GROUPS), "items": []}
    try:
        raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return {"groups": list(DEFAULT_GROUPS), "items": []}
        groups = raw.get("groups")
        if not groups:
            raw["groups"] = list(DEFAULT_GROUPS)
        return raw
    except Exception:
        logger.exception("load_catalog_document failed")
        return {"groups": list(DEFAULT_GROUPS), "items": []}


def save_catalog_document(doc: dict[str, Any]) -> None:
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_PATH.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    load_file_catalog.cache_clear()


@lru_cache
def load_file_catalog() -> list[dict[str, Any]]:
    doc = load_catalog_document()
    items = doc.get("items") or []
    return [i for i in items if isinstance(i, dict)]


def load_file_groups() -> list[dict[str, Any]]:
    doc = load_catalog_document()
    groups = doc.get("groups") or list(DEFAULT_GROUPS)
    out = [g for g in groups if isinstance(g, dict) and g.get("id")]
    out.sort(key=lambda g: int(g.get("sort_order") or 0), reverse=True)
    return out


def get_file_book(book_id: str) -> dict[str, Any] | None:
    for b in load_file_catalog():
        if str(b.get("id")) == book_id:
            return b
    return None
