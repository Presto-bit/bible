"""注释/参考材料入库：切块 → embedding → 写入 bible_rag_chunks。

幂等：以 (title, source_path) 定位文档，body hash 未变则跳过重索引；
embedding 签名变化（换 backend/维度/模型）也会触发重索引。
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from ..db import get_pool
from .core import split_text_into_chunks
from .embedding import get_provider

logger = logging.getLogger(__name__)


def _body_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


def load_embedding_cache(source_type: str | None = None) -> dict[str, list]:
    """加载 chunk_text → embedding 缓存，供重建时复用未变文本的向量（省 API）。"""
    pool = get_pool()
    sql = "SELECT chunk_text, embedding FROM bible_rag_chunks"
    params: tuple = ()
    if source_type:
        sql = ("SELECT c.chunk_text, c.embedding FROM bible_rag_chunks c "
               "JOIN bible_documents d ON d.id=c.document_id "
               "WHERE d.source_type = %s")
        params = (source_type,)
    cache: dict[str, list] = {}
    with pool.connection() as conn:
        for text, emb in conn.execute(sql, params).fetchall():
            if isinstance(emb, list):
                cache[text] = emb
    return cache


def index_text(
    *,
    title: str,
    source_path: str,
    source_type: str,
    body: str,
    force: bool = False,
    embedding_cache: dict[str, list] | None = None,
) -> dict:
    """将一篇文本入库；返回统计信息。

    embedding_cache：可选 chunk_text→向量 缓存，命中则复用、不调用 embedding API。
    """
    provider = get_provider()
    body_hash = _body_hash(body)
    chunks = split_text_into_chunks(body)
    if not chunks:
        return {"title": title, "chunks": 0, "skipped": True, "reason": "empty"}
    emb_sig = provider.signature(provider.dim)

    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, rag_body_hash, rag_embedding_sig FROM bible_documents "
            "WHERE title = %s AND source_path = %s",
            (title, source_path),
        ).fetchone()
        if row and not force and row[1] == body_hash and row[2] == emb_sig:
            return {"title": title, "chunks": len(chunks), "skipped": True, "reason": "unchanged"}

        if row:
            doc_id = row[0]
            conn.execute("DELETE FROM bible_rag_chunks WHERE document_id = %s", (doc_id,))
        else:
            doc_id = conn.execute(
                "INSERT INTO bible_documents (title, source_type, source_path, status) "
                "VALUES (%s, %s, %s, 'indexing') RETURNING id",
                (title, source_type, source_path),
            ).fetchone()[0]

        # 仅对缓存未命中的块调用 embedding API；命中则复用。
        reused = 0
        if embedding_cache is not None:
            misses = [c for c in chunks if c not in embedding_cache]
            new_vecs = provider.embed(misses) if misses else []
            for c, v in zip(misses, new_vecs):
                embedding_cache[c] = v
            vectors = [embedding_cache[c] for c in chunks]
            reused = len(chunks) - len(misses)
        else:
            vectors = provider.embed(chunks)
        for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
            meta = {"title": title, "source_type": source_type}
            conn.execute(
                "INSERT INTO bible_rag_chunks (document_id, chunk_index, chunk_text, embedding, chunk_meta) "
                "VALUES (%s, %s, %s, %s::jsonb, %s::jsonb)",
                (doc_id, idx, chunk, json.dumps(vec), json.dumps(meta, ensure_ascii=False)),
            )
        conn.execute(
            "UPDATE bible_documents SET status='ready', rag_body_hash=%s, rag_embedding_sig=%s, "
            "rag_index_at=now(), updated_at=now() WHERE id=%s",
            (body_hash, emb_sig, doc_id),
        )
        conn.commit()
    return {
        "title": title,
        "chunks": len(chunks),
        "reused": reused,
        "skipped": False,
        "backend": provider.active_backend(),
    }


def index_file(
    path: Path,
    *,
    source_type: str = "commentary",
    force: bool = False,
    embedding_cache: dict[str, list] | None = None,
) -> dict:
    body = path.read_text(encoding="utf-8")
    return index_text(
        title=path.stem,
        source_path=str(path),
        source_type=source_type,
        body=body,
        force=force,
        embedding_cache=embedding_cache,
    )


def index_directory(
    directory: Path,
    *,
    source_type: str = "commentary",
    force: bool = False,
    embedding_cache: dict[str, list] | None = None,
) -> list[dict]:
    files = sorted([p for p in directory.rglob("*") if p.suffix.lower() in (".md", ".txt")])
    results: list[dict] = []
    for p in files:
        try:
            results.append(index_file(
                p, source_type=source_type, force=force,
                embedding_cache=embedding_cache))
        except Exception as exc:
            logger.exception("索引失败 %s", p)
            results.append({"title": p.stem, "error": str(exc)})
    return results
