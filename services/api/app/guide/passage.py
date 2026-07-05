"""GET /guide/passage 的业务逻辑。

流程：
  1. 解析 scripture_ref（JHN.3.16 / 约翰福音3:16 …）
  2. 从离线经文库取该处经文文本，作为检索查询主体
  3. RAG retrieve，按卷名（book_name）过滤注释，混合排序
  4. 返回引用卡片（标题 / 片段 / 相关度 / 经文）
"""
from __future__ import annotations

from ..bible import reader
from ..bible.refs import parse_ref
from ..rag.retrieve import retrieve

SNIPPET_CHARS = 220
RAG_SOURCE_TYPES = ["commentary", "reference-en", "study-bible-zh", "commentary-zh"]


def _passage_text(ref) -> str:
    if ref.chapter is None:
        return ref.book_name
    if ref.verse_start is not None:
        verses = reader.get_verses(
            ref.book_id, ref.chapter, ref.verse_start, ref.verse_end
        )
    else:
        verses = reader.get_chapter(ref.book_id, ref.chapter)
    return " ".join(v["text"] for v in verses).strip()


def guide_for_passage(raw_ref: str, *, top_k: int = 5) -> dict:
    ref = parse_ref(raw_ref)
    if ref is None:
        return {"ok": False, "error": "无法解析经文引用", "ref": raw_ref}

    passage = _passage_text(ref)
    query = f"{ref.display} {passage}".strip()

    try:
        hits = retrieve(
            query,
            top_k=top_k,
            source_types=RAG_SOURCE_TYPES,
            title_contains=ref.book_name,
            book_id=ref.book_id,
        )
        if not hits:
            hits = retrieve(
                query,
                top_k=top_k,
                source_types=RAG_SOURCE_TYPES,
                keywords=[ref.book_name, ref.book_id],
                candidate_limit=1200,
            )
    except Exception:
        hits = []
    cards = [
        {
            "title": h.get("title"),
            "snippet": (h["chunk_text"][:SNIPPET_CHARS]).strip(),
            "score": round(float(h["score"]), 4),
        }
        for h in hits
    ]
    return {
        "ok": True,
        "ref": ref.osis,
        "display": ref.display,
        "passage": passage,
        "cards": cards,
    }
