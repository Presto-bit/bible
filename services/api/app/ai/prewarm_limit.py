"""读经 prewarm 轻量限流（按 X-Guest-Id，进程内滑动窗口）。"""
from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_hits: dict[str, list[float]] = {}
_WINDOW_SEC = 60.0
_MAX_PER_WINDOW = 30


def allow_prewarm(device_id: str | None) -> bool:
    did = (device_id or "").strip()
    if not did:
        return False
    now = time.monotonic()
    with _lock:
        bucket = _hits.setdefault(did, [])
        cutoff = now - _WINDOW_SEC
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        if len(bucket) >= _MAX_PER_WINDOW:
            return False
        bucket.append(now)
        if len(_hits) > 4096:
            stale = [k for k, v in _hits.items() if not v or v[-1] < cutoff]
            for k in stale:
                _hits.pop(k, None)
        return True
