"""pgvector ANN 支持：检测、向量格式化、近邻召回。"""
from __future__ import annotations

import logging
from typing import Any

from ..config import get_settings

logger = logging.getLogger(__name__)

_pgvector_ready: bool | None = None


def format_vector(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in vec) + "]"


def pgvector_ready(conn) -> bool:
    """检测 embedding_vec 列与 vector 扩展是否可用。"""
    global _pgvector_ready
    backend = (get_settings().bible_rag_vector_backend or "auto").strip().lower()
    if backend == "jsonb":
        return False
    if _pgvector_ready is not None and backend != "auto":
        return _pgvector_ready
    try:
        row = conn.execute(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') "
            "AND EXISTS (SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'bible_rag_chunks' AND column_name = 'embedding_vec')"
        ).fetchone()
        ready = bool(row and row[0])
    except Exception:
        ready = False
    if backend in ("pgvector", "auto"):
        _pgvector_ready = ready
        if backend == "pgvector" and not ready:
            logger.warning("BIBLE_RAG_VECTOR_BACKEND=pgvector 但库未就绪，回退 JSONB")
    else:
        _pgvector_ready = False
    return _pgvector_ready


def ann_fetch(
    conn,
    query_vec: list[float],
    *,
    where_clause: str,
    params: list[Any],
    limit: int,
) -> list[tuple]:
    """按 cosine 距离取近邻 chunk（需 embedding_vec 已回填）。"""
    vec_lit = format_vector(query_vec)
    extra = " AND c.embedding_vec IS NOT NULL"
    sql = (
        "SELECT c.chunk_text, c.embedding, c.chunk_meta, d.title, d.id "
        "FROM bible_rag_chunks c JOIN bible_documents d ON d.id = c.document_id"
        f"{where_clause}{extra} "
        "ORDER BY c.embedding_vec <=> %s::vector "
        "LIMIT %s"
    )
    return conn.execute(sql, (*params, vec_lit, limit)).fetchall()
