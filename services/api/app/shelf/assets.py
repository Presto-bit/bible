"""书目资产索引：校验 storage_key 是否属于该书。"""
from __future__ import annotations

from typing import Any


def book_asset_keys(book: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    root = book.get("storage_key")
    if root:
        keys.add(str(root))
    for section in book.get("sections") or []:
        if not isinstance(section, dict):
            continue
        primary = section.get("primary")
        if isinstance(primary, dict) and primary.get("storage_key"):
            keys.add(str(primary["storage_key"]))
        for att in section.get("attachments") or []:
            if isinstance(att, dict) and att.get("storage_key"):
                keys.add(str(att["storage_key"]))
    return keys
