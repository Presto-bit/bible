"""参考资料展示名：统一中文标题。"""
from __future__ import annotations

import re

_ZH_HINT = re.compile(r"背景|注释|释义|导论|概述")


def display_citation_title(title: str | None, book_name: str | None = None) -> str:
    raw = (title or "").strip()
    stripped = re.sub(r"^\d+-", "", raw).strip()
    zh_core = re.sub(r"[A-Za-z0-9_\-.]", "", stripped).strip()
    if len(zh_core) >= 2:
        if _ZH_HINT.search(stripped):
            return stripped
        return f"{stripped} · 背景注释"
    if book_name and book_name.strip():
        return f"{book_name.strip()} · 背景注释"
    return "圣经背景注释"
