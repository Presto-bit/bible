"""简单进程内 IP 限流（登录/注册防爆破）。多实例下各进程独立计数，仍显著抬高成本。"""
from __future__ import annotations

import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request

_lock = threading.Lock()
_buckets: dict[str, list[float]] = defaultdict(list)


def _client_ip(request: Request) -> str:
    # 优先反代注入的真实 IP；勿盲目信任可伪造的 X-Forwarded-For 首段
    real = (request.headers.get("x-real-ip") or "").strip()
    if real:
        return real[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return "unknown"


def enforce_rate_limit(
    request: Request,
    *,
    bucket: str,
    limit: int,
    window_sec: int = 60,
) -> None:
    ip = _client_ip(request)
    key = f"{bucket}:{ip}"
    now = time.monotonic()
    with _lock:
        hits = [t for t in _buckets[key] if now - t < window_sec]
        if len(hits) >= limit:
            _buckets[key] = hits
            raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
        hits.append(now)
        _buckets[key] = hits
        # 防止无限增长：偶发清理空桶
        if len(_buckets) > 10_000:
            stale = [k for k, v in _buckets.items() if not v or now - v[-1] > window_sec]
            for k in stale[:2000]:
                _buckets.pop(k, None)
