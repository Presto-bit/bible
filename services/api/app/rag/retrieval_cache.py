"""RAG 检索结果短 TTL 内存缓存，同章多问复用 embedding + DB 开销。"""
from __future__ import annotations

import hashlib
import time
from copy import deepcopy
from threading import Lock

from ..config import get_settings

_lock = Lock()
_cache: dict[str, tuple[float, list[dict]]] = {}
_MAX_ENTRIES = 400


def retrieval_cache_key(
    query: str,
    *,
    book_name: str | None,
    book_id: str | None,
    chapter: int | None,
    top_k: int,
    source_types: list[str] | None,
) -> str:
    types = ",".join(sorted(source_types or []))
    raw = "|".join(
        [
            (query or "").strip(),
            (book_name or "").strip(),
            (book_id or "").strip().upper(),
            str(chapter if chapter is not None else ""),
            str(int(top_k)),
            types,
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _strip_embeddings(hits: list[dict]) -> list[dict]:
    out: list[dict] = []
    for hit in hits:
        item = {k: v for k, v in hit.items() if k != "embedding"}
        out.append(item)
    return out


def get_retrieval(key: str) -> list[dict] | None:
    ttl = max(0, int(get_settings().rag_retrieval_cache_ttl))
    if ttl <= 0 or not key:
        return None
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if not hit:
            return None
        ts, payload = hit
        if now - ts >= ttl:
            _cache.pop(key, None)
            return None
        return deepcopy(payload)


def put_retrieval(key: str, hits: list[dict]) -> None:
    ttl = max(0, int(get_settings().rag_retrieval_cache_ttl))
    if ttl <= 0 or not key or not hits:
        return
    now = time.monotonic()
    payload = _strip_embeddings(hits)
    with _lock:
        _cache[key] = (now, payload)
        if len(_cache) > _MAX_ENTRIES:
            oldest_key = min(_cache.items(), key=lambda x: x[1][0])[0]
            _cache.pop(oldest_key, None)


def clear_retrieval_cache() -> None:
    with _lock:
        _cache.clear()
