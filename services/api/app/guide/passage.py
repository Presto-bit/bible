"""GET /guide/passage 的业务逻辑。

流程：
  1. 解析 scripture_ref（JHN.3.16 / 约翰福音3:16 …）
  2. 从离线经文库取该处经文文本，作为检索查询主体
  3. RAG retrieve，按卷名/章过滤注释，混合排序 + 多注释轮询
  4. 返回引用卡片（标题 / 片段 / 相关度 / 经文）
"""
from __future__ import annotations

from ..bible import reader
from ..bible.refs import parse_ref
from ..rag.retrieve import retrieve_for_passage

SNIPPET_CHARS = 220


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


def guide_for_passage(
    raw_ref: str,
    *,
    top_k: int = 5,
    knowledge_base_id: str | None = None,
) -> dict:
    from ..ai.knowledge_bases import resolve_knowledge_base, source_types_for_kb

    ref = parse_ref(raw_ref)
    if ref is None:
        return {"ok": False, "error": "无法解析经文引用", "ref": raw_ref}

    kb = resolve_knowledge_base(knowledge_base_id)
    source_types = source_types_for_kb(kb["id"])
    passage = _passage_text(ref)
    query = f"{ref.display} {passage}".strip()

    try:
        hits = retrieve_for_passage(
            query,
            book_name=ref.book_name,
            book_id=ref.book_id,
            chapter=ref.chapter,
            top_k=top_k,
            source_types=source_types,
        )
    except Exception:
        hits = []
    cards = [
        {
            "title": h.get("title"),
            "snippet": (h["chunk_text"][:SNIPPET_CHARS]).strip(),
            "score": round(float(h["score"]), 4),
            "document_id": h.get("document_id"),
        }
        for h in hits
    ]
    return {
        "ok": True,
        "ref": ref.osis,
        "display": ref.display,
        "passage": passage,
        "knowledge_base_id": kb["id"],
        "knowledge_base_name": kb["name"],
        "cards": cards,
    }
