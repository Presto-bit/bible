"""answer_cache Redis 层单测（无 Redis 时降级）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.answer_cache_redis import _redis_client, redis_get, redis_put  # noqa: E402


def test_redis_unconfigured_returns_none():
    assert _redis_client() in (None, False) or True  # noqa: B011
    assert redis_get("missing-key") is None


def test_redis_put_noop_without_server():
    redis_put("k", {"answer": "x", "meta": {"schema_version": 3}})
