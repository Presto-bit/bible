"""检索：从 bible_rag_chunks 召回候选块，向量+关键词混合排序。

当前为内存重排（候选量按经文/文档过滤后通常可控）；后续量大可换 pgvector / 预过滤。
"""
from __future__ import annotations

from ..config import get_settings
from ..db import get_pool
from .core import hybrid_rank
from .embedding import get_provider


def retrieve(
    query: str,
    *,
    top_k: int = 8,
    source_type: str | None = None,
    document_title: str | None = None,
    title_contains: str | None = None,
    keywords: list[str] | None = None,
    candidate_limit: int = 600,
) -> list[dict]:
    """召回与 query 最相关的注释块。

    source_type / document_title / title_contains 用于缩小候选范围
    （如按经文引用过滤到某卷注释：title_contains="约翰福音"）。
    keywords：对 chunk_text 做 ILIKE OR 预过滤，用于全库检索时把候选缩到
    主题相关块（避免无序 LIMIT 取到无关早段）。
    """
    query = (query or "").strip()
    if not query:
        return []

    where = []
    params: list = []
    if source_type:
        where.append("c.chunk_meta->>'source_type' = %s")
        params.append(source_type)
    if document_title:
        where.append("d.title = %s")
        params.append(document_title)
    if title_contains:
        where.append("d.title LIKE %s")
        params.append(f"%{title_contains}%")
    if keywords:
        ors = " OR ".join(["c.chunk_text ILIKE %s"] * len(keywords))
        where.append(f"({ors})")
        params.extend([f"%{k}%" for k in keywords])
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT c.chunk_text, c.embedding, c.chunk_meta, d.title "
            "FROM bible_rag_chunks c JOIN bible_documents d ON d.id = c.document_id"
            f"{clause} LIMIT %s",
            (*params, candidate_limit),
        ).fetchall()

    candidates = [
        {
            "chunk_text": r[0],
            "embedding": r[1] if isinstance(r[1], list) else [],
            "meta": r[2],
            "title": r[3],
        }
        for r in rows
    ]
    if not candidates:
        return []

    provider = get_provider()
    qvec = provider.embed_one(query)
    s = get_settings()
    return hybrid_rank(
        query,
        candidates,
        qvec,
        top_k=top_k,
        vector_weight=s.rag_hybrid_vector_weight,
        keyword_weight=s.rag_hybrid_keyword_weight,
    )
