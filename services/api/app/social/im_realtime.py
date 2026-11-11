"""IM 实时：cursor 短缓存 + SSE 唤醒（本机 Future / Redis pubsub）。

从 im_router 抽出，降低巨石文件体积；路由仍挂在 im_router。
"""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from datetime import datetime, timezone

from ..db import get_pool

logger = logging.getLogger(__name__)

_cursor_cache: dict[str, tuple[float, dict]] = {}
_CURSOR_TTL_SEC = 1.6
_cursor_lock = threading.Lock()

_wake_waiters: dict[str, set[asyncio.Future]] = {}
_wake_lock = threading.Lock()
SSE_IDLE_WAIT_SEC = 1.5


def _wake_local_sse(user_ids: list[str]) -> None:
    pending: list[asyncio.Future] = []
    with _wake_lock:
        for uid in user_ids:
            pending.extend(_wake_waiters.get(uid, ()))
    for fut in pending:
        if fut.done():
            continue
        try:
            loop = fut.get_loop()
            loop.call_soon_threadsafe(fut.set_result, True)
        except Exception:
            try:
                fut.set_result(True)
            except Exception:
                pass


def invalidate_realtime_cursors(user_ids: list[str] | set[str] | tuple[str, ...]) -> None:
    ids = [str(u).strip() for u in user_ids if u and str(u).strip()]
    if not ids:
        return
    with _cursor_lock:
        for uid in ids:
            _cursor_cache.pop(uid, None)
    _wake_local_sse(ids)
    try:
        from ..redis_util import publish_sse_wake

        publish_sse_wake(ids)
    except Exception:
        pass


def start_sse_wake_redis_bridge() -> None:
    try:
        from ..redis_util import ensure_sse_wake_subscriber

        def _on_ids(raw_ids: list) -> None:
            ids = [str(u).strip() for u in raw_ids if u and str(u).strip()]
            if not ids:
                return
            with _cursor_lock:
                for uid in ids:
                    _cursor_cache.pop(uid, None)
            _wake_local_sse(ids)

        ensure_sse_wake_subscriber(_on_ids)
    except Exception:
        logger.exception("start_sse_wake_redis_bridge failed")


async def wait_sse_wake(user_id: str, timeout: float) -> None:
    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()
    with _wake_lock:
        _wake_waiters.setdefault(user_id, set()).add(fut)
    try:
        await asyncio.wait_for(asyncio.shield(fut), timeout=timeout)
    except asyncio.TimeoutError:
        pass
    finally:
        with _wake_lock:
            waiters = _wake_waiters.get(user_id)
            if waiters is not None:
                waiters.discard(fut)
                if not waiters:
                    _wake_waiters.pop(user_id, None)


def compute_realtime_cursor(user_id: str, *, retention_cutoff) -> dict:
    now = time.monotonic()
    with _cursor_lock:
        hit = _cursor_cache.get(user_id)
        if hit and now - hit[0] < _CURSOR_TTL_SEC:
            return hit[1]

    pool = get_pool()
    cutoff = retention_cutoff
    with pool.connection() as conn:
        gmax = conn.execute(
            """
            SELECT COALESCE(MAX(gm.created_at), '-infinity'::timestamptz)
            FROM group_message gm
            JOIN group_member m ON m.group_id = gm.group_id AND m.user_id = %s
            WHERE gm.created_at >= %s
            """,
            (user_id, cutoff),
        ).fetchone()[0]
        dmax = conn.execute(
            """
            SELECT COALESCE(MAX(dm.created_at), '-infinity'::timestamptz)
            FROM direct_message dm
            JOIN direct_thread t ON t.id = dm.thread_id
            WHERE (t.user_low_id = %s OR t.user_high_id = %s)
              AND dm.created_at >= %s
            """,
            (user_id, user_id, cutoff),
        ).fetchone()[0]

    def iso(v):
        if v is None or str(v).startswith("-"):
            return None
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    result = {
        "group_max": iso(gmax),
        "dm_max": iso(dmax),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
    with _cursor_lock:
        _cursor_cache[user_id] = (time.monotonic(), result)
        if len(_cursor_cache) > 2000:
            cutoff_t = time.monotonic() - 60
            stale = [k for k, (ts, _) in _cursor_cache.items() if ts < cutoff_t]
            for k in stale:
                _cursor_cache.pop(k, None)
    return result
