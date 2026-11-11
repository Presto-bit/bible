"""全员信异步 Worker：queued → sending → 分批 fan-out。"""
from __future__ import annotations

import logging
import threading
import time

from ..db import get_pool
from .official_outreach import process_broadcast_batch
from .outreach_schema import ensure_outreach_schema

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 2.0
_BATCH_SIZE = 40

_WORKER_LOCK = threading.Lock()
_WORKER_STARTED = False
_WAKE = threading.Event()


def start_outreach_worker() -> None:
    global _WORKER_STARTED
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return
        t = threading.Thread(target=_worker_loop, name="outreach-broadcast-worker", daemon=True)
        t.start()
        _WORKER_STARTED = True
        logger.info("outreach broadcast worker started (batch=%s)", _BATCH_SIZE)


def wake_outreach_worker() -> None:
    """管理端入队后唤醒，减少空转等待。"""
    start_outreach_worker()
    _WAKE.set()


def _worker_loop() -> None:
    while True:
        try:
            worked = _tick()
            if not worked:
                _WAKE.wait(timeout=_POLL_INTERVAL)
                _WAKE.clear()
            else:
                time.sleep(0.05)
        except Exception:
            logger.exception("outreach worker tick error")
            time.sleep(_POLL_INTERVAL)


def _pick_active_job(conn) -> str | None:
    row = conn.execute(
        """
        SELECT j.id::text
        FROM platform_outreach_job j
        WHERE j.kind = 'broadcast'
          AND j.status IN ('queued', 'sending')
          AND EXISTS (
            SELECT 1 FROM platform_outreach_queue q
            WHERE q.job_id = j.id AND q.done_at IS NULL
          )
        ORDER BY j.created_at ASC
        LIMIT 1
        """
    ).fetchone()
    return str(row[0]) if row else None


def _finalize_if_drained(conn, job_id: str) -> None:
    pending = conn.execute(
        "SELECT count(*)::int FROM platform_outreach_queue "
        "WHERE job_id = %s AND done_at IS NULL",
        (job_id,),
    ).fetchone()
    if pending and int(pending[0] or 0) > 0:
        return
    conn.execute(
        """
        UPDATE platform_outreach_job
        SET status = 'done', sent_at = COALESCE(sent_at, now())
        WHERE id = %s AND status IN ('queued', 'sending')
        """,
        (job_id,),
    )


def _tick() -> bool:
    pool = get_pool()
    with pool.connection() as conn:
        ensure_outreach_schema(conn)
        job_id = _pick_active_job(conn)
        if not job_id:
            conn.commit()
            return False

    stats = process_broadcast_batch(job_id, limit=_BATCH_SIZE)
    with pool.connection() as conn:
        ensure_outreach_schema(conn)
        _finalize_if_drained(conn, job_id)
        conn.commit()
    logger.debug(
        "outreach batch job=%s sent=%s skipped=%s failed=%s pending=%s",
        job_id[:8],
        stats.get("sent"),
        stats.get("skipped"),
        stats.get("failed"),
        stats.get("pending"),
    )
    return True
