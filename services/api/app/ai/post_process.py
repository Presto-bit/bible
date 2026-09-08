"""小爱回答后处理：脚注校验等。"""
from __future__ import annotations

import re

_FOOTNOTE_RE = re.compile(r"\[\d{1,2}\]")


def needs_citation_repair(body: str, *, has_rag: bool, citation_count: int) -> bool:
    if not has_rag or citation_count <= 0:
        return False
    text = (body or "").strip()
    if not text or text.startswith("⚠️"):
        return False
    return _FOOTNOTE_RE.search(text) is None
