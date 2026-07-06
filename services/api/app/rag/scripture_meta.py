"""从 Markdown 章节标题解析 chunk_meta（书卷 / 章 / 节）。"""
from __future__ import annotations

import re

from ..bible.refs import parse_ref

_ZH_CHAPTER = re.compile(r"(\d+)\s*章")


def meta_from_heading(heading: str, default_book_id: str | None = None) -> dict:
    """解析 `## JHN 1:9` / `## 约翰福音 1 章` 等标题为 chunk_meta 字段。"""
    h = (heading or "").strip()
    if not h:
        return {}

    ref = parse_ref(h)
    if ref and ref.chapter is not None:
        out: dict = {
            "book_id": ref.book_id,
            "chapter": ref.chapter,
            "chapter_id": f"{ref.book_id}_{ref.chapter}",
        }
        if ref.verse_start is not None:
            out["verse_start"] = ref.verse_start
            out["verse_end"] = ref.verse_end or ref.verse_start
            out["scripture_refs"] = [
                {
                    "book": ref.book_id,
                    "chapter": ref.chapter,
                    "verse_start": ref.verse_start,
                    "verse_end": ref.verse_end or ref.verse_start,
                }
            ]
        return out

    if default_book_id:
        m = _ZH_CHAPTER.search(h)
        if m:
            ch = int(m.group(1))
            return {
                "book_id": default_book_id,
                "chapter": ch,
                "chapter_id": f"{default_book_id}_{ch}",
            }

    return {}
