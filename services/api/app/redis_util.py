"""共享 Redis 客户端：限流 / SSE 跨实例唤醒。未配置时静默回退内存。"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_client: Any | None = None
_client_failed = False
_sse_listener_started = False

SSE_WAKE_CHANNEL = "bible:sse:wake"


def redis_url() -> str:
    from .config import get_settings

    s = get_settings()
    return (s.redis_url or s.rag_answer_cache_redis_url or "").strip()


def get_redis():
    """返回 redis 客户端；不可用则 None。"""
    global _client, _client_failed
    if _client_failed:
        return None
    url = redis_url()
    if not url:
        return None
    with _lock:
        if _client is not None:
            return _client
        try:
            import redis

            _client = redis.from_url(url, decode_responses=True, socket_connect_timeout=1.5)
            _client.ping()
            return _client
        except Exception as exc:
            _client_failed = True
            logger.warning("redis unavailable, fallback in-memory: %s", exc)
            return None


def rate_limit_incr(key: str, *, window_sec: int) -> int | None:
    """滑动窗口近似：INCR + 首次 EXPIRE。失败返回 None（调用方回退内存）。"""
    client = get_redis()
    if client is None:
        return None
    try:
        n = int(client.incr(key))
        if n == 1:
            client.expire(key, max(1, int(window_sec)))
        return n
    except Exception as exc:
        logger.warning("redis rate_limit_incr failed: %s", exc)
        return None


def publish_sse_wake(user_ids: list[str]) -> None:
    client = get_redis()
    if client is None or not user_ids:
        return
    try:
        client.publish(SSE_WAKE_CHANNEL, json.dumps(user_ids, ensure_ascii=False))
    except Exception as exc:
        logger.warning("redis publish_sse_wake failed: %s", exc)


def ensure_sse_wake_subscriber(on_ids) -> None:
    """API 进程内启动一次 pub/sub 监听，把跨实例 wake 灌回本机 Future。"""
    global _sse_listener_started
    client = get_redis()
    if client is None:
        return
    with _lock:
        if _sse_listener_started:
            return
        _sse_listener_started = True

    def _loop() -> None:
        try:
            pubsub = client.pubsub(ignore_subscribe_messages=True)
            pubsub.subscribe(SSE_WAKE_CHANNEL)
            for msg in pubsub.listen():
                if not msg or msg.get("type") != "message":
                    continue
                raw = msg.get("data") or "[]"
                try:
                    ids = json.loads(raw)
                except Exception:
                    continue
                if isinstance(ids, list):
                    on_ids(ids)
        except Exception:
            logger.exception("sse wake subscriber stopped")

    threading.Thread(target=_loop, name="sse-wake-redis", daemon=True).start()
