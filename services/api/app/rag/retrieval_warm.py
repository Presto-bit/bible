"""章级 RAG 检索预热（进入经节时写入 retrieval_cache）。"""
from __future__ import annotations

import logging

from ..config import get_settings

logger = logging.getLogger(__name__)


def warm_retrieval_for_ref(ref) -> None:
    """进入经节时预热章级检索缓存，加速 Tab 追问 RAG。"""
    if ref is None or getattr(ref, "chapter", None) is None:
        return
    s = get_settings()
    if not int(getattr(s, "rag_retrieval_prewarm_on_read", 1)):
        return
    book_name = getattr(ref, "book_name", None)
    book_id = getattr(ref, "book_id", None)
    chapter = ref.chapter
    query = f"{book_name or book_id or ''} {chapter}章".strip()
    if not query:
        return
    try:
        from .retrieve import retrieve_for_passage

        retrieve_for_passage(
            query,
            book_name=book_name,
            book_id=book_id,
            chapter=chapter,
            top_k=4,
        )
    except Exception as exc:
        logger.warning(
            "retrieval prewarm failed ref=%s: %s",
            getattr(ref, "osis", ref),
            exc,
        )
