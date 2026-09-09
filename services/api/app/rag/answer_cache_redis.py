"""答案缓存 Redis L2（可选；未配置时仅内存 L1）。"""
from __future__ import annotations

import json
import logging
from typing import Any

from ..config import get_settings

logger = logging.getLogger(__name__)

_PREFIX = "bible:ai:answer:"
_client: Any = None
_init_attempted = False


def _redis_client():
    global _client, _init_attempted
    if _init_attempted:
        return _client or None
    _init_attempted = True
    url = (get_settings().rag_answer_cache_redis_url or "").strip()
    if not url:
        return None
    try:
        import redis

        client = redis.from_url(url, decode_responses=True)
        client.ping()
        _client = client
        logger.info("answer cache Redis connected")
        return _client
    except Exception as exc:
        logger.warning("answer cache Redis unavailable: %s", exc)
        return None


def redis_get(key: str) -> dict[str, Any] | None:
    client = _redis_client()
    if not client or not key:
        return None
    ttl = max(0, int(get_settings().rag_answer_cache_ttl))
    if ttl <= 0:
        return None
    try:
        raw = client.get(f"{_PREFIX}{key}")
        if not raw:
            return None
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except Exception as exc:
        logger.warning("answer cache Redis get failed: %s", exc)
        return None


def redis_put(key: str, payload: dict[str, Any]) -> None:
    client = _redis_client()
    if not client or not key:
        return
    ttl = max(0, int(get_settings().rag_answer_cache_ttl))
    if ttl <= 0:
        return
    try:
        client.setex(f"{_PREFIX}{key}", ttl, json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        logger.warning("answer cache Redis put failed: %s", exc)


def redis_clear_all() -> int:
    client = _redis_client()
    if not client:
        return 0
    removed = 0
    try:
        for k in client.scan_iter(match=f"{_PREFIX}*"):
            client.delete(k)
            removed += 1
    except Exception as exc:
        logger.warning("answer cache Redis clear failed: %s", exc)
    return removed


def redis_clear_for_ref_prefix(ref_prefix: str, *, max_verse: int = 176) -> int:
    """按 payload.meta.ref 前缀删除 Redis 条目。"""
    from .answer_cache import cache_key, normalize_ref

    client = _redis_client()
    if not client:
        return 0
    prefix = normalize_ref(ref_prefix)
    if not prefix:
        return 0
    removed = 0
    try:
        for k in client.scan_iter(match=f"{_PREFIX}*"):
            raw = client.get(k)
            if not raw:
                continue
            try:
                data = json.loads(raw)
                meta = (data or {}).get("meta") or {}
                ref = normalize_ref(meta.get("ref") or "")
                if ref and (ref == prefix or ref.startswith(prefix + ".")):
                    client.delete(k)
                    removed += 1
            except json.JSONDecodeError:
                continue
        parts = prefix.split(".")
        if len(parts) >= 2 and parts[-1].isdigit():
            book, chapter = parts[0], parts[-1]
            base = f"{book}.{chapter}"
            refs = [base, prefix]
            for v in range(1, max_verse + 1):
                refs.append(f"{base}.{v}")
            for scene in ("verse_full", "verse_quick"):
                for ref in refs:
                    hk = cache_key(ref=ref, mode="explain", question=None, scene=scene)
                    rk = f"{_PREFIX}{hk}"
                    if client.delete(rk):
                        removed += 1
    except Exception as exc:
        logger.warning("answer cache Redis prefix clear failed: %s", exc)
    return removed
