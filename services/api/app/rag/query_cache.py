"""查询向量短 TTL 内存缓存，减少重复 embedding API 调用。"""
from __future__ import annotations

import hashlib
import time
from threading import Lock

from ..config import get_settings
from .embedding import get_provider

_lock = Lock()
_cache: dict[str, tuple[float, list[float]]] = {}
_MAX_ENTRIES = 500


def embed_query_cached(query: str) -> list[float]:
    q = (query or "").strip()
    if not q:
        return []
    ttl = max(0, int(get_settings().rag_query_embed_cache_ttl))
    key = hashlib.sha256(q.encode("utf-8")).hexdigest()
    now = time.monotonic()
    if ttl > 0:
        with _lock:
            hit = _cache.get(key)
            if hit and now - hit[0] < ttl:
                return hit[1]
    vec = get_provider().embed_one(q)
    if ttl > 0:
        with _lock:
            _cache[key] = (now, vec)
            if len(_cache) > _MAX_ENTRIES:
                oldest_key = min(_cache.items(), key=lambda x: x[1][0])[0]
                _cache.pop(oldest_key, None)
    return vec


def clear_query_cache() -> None:
    with _lock:
        _cache.clear()
