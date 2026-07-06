"""检索：从 bible_rag_chunks 召回候选块，向量+关键词混合排序。

支持：书卷/章元数据预过滤、pgvector ANN、查询向量缓存、多注释轮询均衡。
"""
from __future__ import annotations

import logging
import re

from ..config import get_settings
from ..db import get_pool
from .core import balance_across_documents, hybrid_rank
from .pgvector import ann_fetch, pgvector_ready
from .query_cache import embed_query_cached

logger = logging.getLogger(__name__)

_STOP = {"什么", "怎么", "为什么", "如何", "这节", "这段", "经文", "意思", "讲的",
         "讲什么", "请问", "可以", "我们", "他们", "关于", "以及"}


def _keywords(text: str, limit: int = 8) -> list[str]:
    kws: list[str] = []
    for run in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        if run not in _STOP:
            kws.append(run)
        for i in range(len(run) - 1):
            bigram = run[i:i + 2]
            if bigram not in _STOP:
                kws.append(bigram)
    kws.extend(re.findall(r"[A-Za-z]{3,}", text))
    seen: list[str] = []
    for k in kws:
        if k not in seen:
            seen.append(k)
    return seen[:limit]


def _build_where(
    *,
    source_types: list[str] | None,
    document_title: str | None,
    title_contains: str | None,
    book_id: str | None,
    chapter: int | None,
    keywords: list[str] | None,
) -> tuple[str, list]:
    where: list[str] = []
    params: list = []
    if source_types:
        where.append("c.chunk_meta->>'source_type' = ANY(%s)")
        params.append(source_types)
    if document_title:
        where.append("d.title = %s")
        params.append(document_title)
    book_filters: list[str] = []
    if title_contains:
        book_filters.append("d.title ILIKE %s")
        params.append(f"%{title_contains}%")
    bid = book_id.upper() if book_id else None
    if bid:
        book_filters.extend([
            "d.title ILIKE %s",
            "c.chunk_meta->>'book_id' = %s",
            "d.source_path ILIKE %s",
        ])
        params.extend([f"%{bid}%", bid, f"%{bid.lower()}%"])
    if book_filters:
        where.append("(" + " OR ".join(book_filters) + ")")
    if chapter is not None:
        ch = str(int(chapter))
        ch_filters = ["c.chunk_meta->>'chapter' = %s"]
        ch_params: list = [ch]
        if bid:
            ch_filters.append("c.chunk_meta->>'chapter_id' = %s")
            ch_params.append(f"{bid}_{ch}")
        where.append("(" + " OR ".join(ch_filters) + ")")
        params.extend(ch_params)
    if keywords:
        ors = " OR ".join(["c.chunk_text ILIKE %s"] * len(keywords))
        where.append(f"({ors})")
        params.extend([f"%{k}%" for k in keywords])
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    return clause, params


def _rows_to_candidates(rows) -> list[dict]:
    return [
        {
            "chunk_text": r[0],
            "embedding": r[1] if isinstance(r[1], list) else [],
            "meta": r[2] if isinstance(r[2], dict) else {},
            "title": r[3],
            "document_id": str(r[4]) if len(r) > 4 and r[4] is not None else None,
        }
        for r in rows
    ]


def _fetch_candidates(
    conn,
    *,
    where_clause: str,
    params: list,
    candidate_limit: int,
    query_vec: list[float],
) -> list[dict]:
    if pgvector_ready(conn) and query_vec:
        try:
            rows = ann_fetch(
                conn,
                query_vec,
                where_clause=where_clause,
                params=params,
                limit=candidate_limit,
            )
            if rows:
                return _rows_to_candidates(rows)
        except Exception as exc:
            logger.warning("pgvector ANN 失败，回退 JSONB：%s", exc)

    rows = conn.execute(
        "SELECT c.chunk_text, c.embedding, c.chunk_meta, d.title, d.id "
        "FROM bible_rag_chunks c JOIN bible_documents d ON d.id = c.document_id"
        f"{where_clause} LIMIT %s",
        (*params, candidate_limit),
    ).fetchall()
    return _rows_to_candidates(rows)


def retrieve(
    query: str,
    *,
    top_k: int = 8,
    source_type: str | None = None,
    source_types: list[str] | None = None,
    document_title: str | None = None,
    title_contains: str | None = None,
    book_id: str | None = None,
    chapter: int | None = None,
    keywords: list[str] | None = None,
    candidate_limit: int | None = None,
    balance_docs: bool = True,
) -> list[dict]:
    """召回与 query 最相关的注释块。"""
    query = (query or "").strip()
    if not query:
        return []

    types = source_types or ([source_type] if source_type else None)
    s = get_settings()
    if candidate_limit is None:
        candidate_limit = (
            s.rag_candidate_limit_book
            if (title_contains or book_id)
            else s.rag_candidate_limit_fallback
        )

    where_clause, params = _build_where(
        source_types=types,
        document_title=document_title,
        title_contains=title_contains,
        book_id=book_id,
        chapter=chapter,
        keywords=keywords,
    )

    pool = get_pool()
    qvec = embed_query_cached(query)
    with pool.connection() as conn:
        candidates = _fetch_candidates(
            conn,
            where_clause=where_clause,
            params=params,
            candidate_limit=candidate_limit,
            query_vec=qvec,
        )

    if not candidates:
        return []

    ranked = hybrid_rank(
        query,
        candidates,
        qvec,
        top_k=len(candidates),
        vector_weight=s.rag_hybrid_vector_weight,
        keyword_weight=s.rag_hybrid_keyword_weight,
    )
    if balance_docs:
        return balance_across_documents(ranked, top_k)
    return ranked[:top_k]


def retrieve_for_passage(
    query: str,
    *,
    book_name: str | None,
    book_id: str | None,
    chapter: int | None,
    top_k: int = 4,
    source_types: list[str] | None = None,
) -> list[dict]:
    """经文章节检索：书卷+章 → 书卷 → 关键词兜底，带多注释轮询。"""
    types = source_types or [
        "commentary", "reference-en", "study-bible-zh", "commentary-zh",
    ]
    s = get_settings()
    base = dict(
        query=query,
        top_k=top_k,
        source_types=types,
        title_contains=book_name,
        book_id=book_id,
        balance_docs=True,
    )

    if book_name or book_id:
        if chapter is not None:
            hits = retrieve(
                **base,
                chapter=chapter,
                candidate_limit=s.rag_candidate_limit_chapter,
            )
            if hits:
                return hits
        hits = retrieve(
            **base,
            chapter=None,
            candidate_limit=s.rag_candidate_limit_book,
        )
        if hits:
            return hits

    return retrieve(
        query,
        top_k=top_k,
        source_types=types,
        keywords=_keywords(query),
        candidate_limit=s.rag_candidate_limit_fallback,
        balance_docs=True,
    )
