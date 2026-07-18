"""消息近实时推送：发消息后短 debounce 合并投递。"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from ..db import get_pool
from .digest_delivery import deliver_group_digest

logger = logging.getLogger(__name__)

# 近实时：约 2s 合并连发，避免每条都推
DEBOUNCE_SECONDS = 2
_POLL_INTERVAL = 1.0
_RETRY_SECONDS = 15

_SCHEMA_READY = False
_SCHEMA_LOCK = threading.Lock()
_WORKER_LOCK = threading.Lock()
_WORKER_STARTED = False

_ENSURE_SQL = """
CREATE TABLE IF NOT EXISTS push_digest_due (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_digest_due_at ON push_digest_due (due_at);
"""


def ensure_digest_due_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        pool = get_pool()
        with pool.connection() as conn:
            conn.execute(_ENSURE_SQL)
            conn.commit()
        _SCHEMA_READY = True


def start_digest_worker() -> None:
    """启动后台刷新线程（幂等）。"""
    global _WORKER_STARTED
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return
        ensure_digest_due_schema()
        t = threading.Thread(target=_worker_loop, name="push-digest-worker", daemon=True)
        t.start()
        _WORKER_STARTED = True
        logger.info("push digest worker started (debounce=%ss)", DEBOUNCE_SECONDS)


def schedule_digest_users(user_ids: list[str] | set[str]) -> None:
    """为接收方登记/重置 due_at = now + debounce（仅有 group_digest 订阅的用户）。"""
    ids = [str(u).strip() for u in user_ids if u and str(u).strip()]
    if not ids:
        return
    try:
        ensure_digest_due_schema()
        start_digest_worker()
        due = datetime.now(timezone.utc) + timedelta(seconds=DEBOUNCE_SECONDS)
        pool = get_pool()
        with pool.connection() as conn:
            rows = conn.execute(
                "SELECT DISTINCT user_id::text FROM push_subscription "
                "WHERE user_id = ANY(%s::uuid[]) AND COALESCE(group_digest, false) = true",
                (ids,),
            ).fetchall()
            eligible = [r[0] for r in rows]
            for uid in eligible:
                conn.execute(
                    "INSERT INTO push_digest_due (user_id, due_at, updated_at) "
                    "VALUES (%s::uuid, %s, now()) "
                    "ON CONFLICT (user_id) DO UPDATE SET "
                    "due_at = EXCLUDED.due_at, updated_at = now()",
                    (uid, due),
                )
            conn.commit()
        if eligible:
            logger.debug("digest scheduled n=%s due_in=%ss", len(eligible), DEBOUNCE_SECONDS)
    except Exception:
        logger.exception("schedule_digest_users failed")


def schedule_dm_peer(peer_id: str) -> None:
    schedule_digest_users([peer_id])


def schedule_group_members(gid: str, *, exclude_user_id: str) -> None:
    """群成员中已开启聚合推送的用户：直接排队（不再二次过滤）。"""
    try:
        ensure_digest_due_schema()
        start_digest_worker()
        due = datetime.now(timezone.utc) + timedelta(seconds=DEBOUNCE_SECONDS)
        pool = get_pool()
        with pool.connection() as conn:
            rows = conn.execute(
                "SELECT DISTINCT m.user_id::text FROM group_member m "
                "JOIN push_subscription ps ON ps.user_id = m.user_id "
                "  AND COALESCE(ps.group_digest, false) = true "
                "WHERE m.group_id = %s AND m.user_id <> %s::uuid",
                (gid, exclude_user_id),
            ).fetchall()
            for (uid,) in rows:
                conn.execute(
                    "INSERT INTO push_digest_due (user_id, due_at, updated_at) "
                    "VALUES (%s::uuid, %s, now()) "
                    "ON CONFLICT (user_id) DO UPDATE SET "
                    "due_at = EXCLUDED.due_at, updated_at = now()",
                    (uid, due),
                )
            conn.commit()
        if rows:
            logger.debug(
                "digest scheduled group=%s n=%s due_in=%ss",
                gid[:8],
                len(rows),
                DEBOUNCE_SECONDS,
            )
    except Exception:
        logger.exception("schedule_group_members failed gid=%s", gid)


def _worker_loop() -> None:
    while True:
        try:
            _flush_due()
        except Exception:
            logger.exception("push digest flush error")
        time.sleep(_POLL_INTERVAL)


def _flush_due() -> None:
    """领取到期任务 → 投递；成功删除，异常则 30s 后重试。"""
    ensure_digest_due_schema()
    now = datetime.now(timezone.utc)
    pool = get_pool()
    with pool.connection() as conn:
        # SKIP LOCKED：多 worker 时避免重复领取
        try:
            rows = conn.execute(
                "SELECT user_id::text FROM push_digest_due WHERE due_at <= %s "
                "ORDER BY due_at ASC LIMIT 50 "
                "FOR UPDATE SKIP LOCKED",
                (now,),
            ).fetchall()
        except Exception:
            # 无 SKIP LOCKED 的旧 PG：退回普通 SELECT
            rows = conn.execute(
                "SELECT user_id::text FROM push_digest_due WHERE due_at <= %s "
                "ORDER BY due_at ASC LIMIT 50",
                (now,),
            ).fetchall()
        if not rows:
            return
        ids = [r[0] for r in rows]
        # 先摘除队列，避免投递期间被再次扫到
        conn.execute(
            "DELETE FROM push_digest_due WHERE user_id = ANY(%s::uuid[])",
            (ids,),
        )
        conn.commit()

    retry_due = datetime.now(timezone.utc) + timedelta(seconds=_RETRY_SECONDS)
    for uid in ids:
        try:
            deliver_group_digest(uid, require_unread=True)
        except Exception:
            logger.exception("deliver digest failed user=%s; retry in %ss", uid[:8], _RETRY_SECONDS)
            try:
                with pool.connection() as conn:
                    conn.execute(
                        "INSERT INTO push_digest_due (user_id, due_at, updated_at) "
                        "VALUES (%s::uuid, %s, now()) "
                        "ON CONFLICT (user_id) DO UPDATE SET "
                        "due_at = LEAST(push_digest_due.due_at, EXCLUDED.due_at), "
                        "updated_at = now()",
                        (uid, retry_due),
                    )
                    conn.commit()
            except Exception:
                logger.exception("requeue digest failed user=%s", uid[:8])
