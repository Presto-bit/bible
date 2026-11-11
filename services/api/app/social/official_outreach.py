"""彼爱团队官方私信：欢迎信、全员 fan-out。"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from ..db import get_pool
from .im_router import (
    OFFICIAL_SUPPORT_USER_CODE,
    _official_support_uuid,
    invalidate_realtime_cursors,
)
from .outreach_schema import ensure_outreach_schema

logger = logging.getLogger(__name__)

OFFICIAL_DISPLAY_NAME = "彼爱团队"
WELCOME_TEMPLATE_KEY = "welcome_v2"
WELCOME_PIN_DAYS = 7
BROADCAST_MAX_PER_MONTH = 2


def welcome_notice_body() -> str:
    return (
        "欢迎使用彼爱APP，使用中的任何问题，功能建议等直接这里回复即可，期待和您同行。"
    )


def welcome_notice_ref_json() -> str:
    payload = {
        "title": "彼爱团队",
        "actions": [{"label": "产品说明", "href": "/help/product"}],
    }
    return json.dumps(payload, ensure_ascii=False)


def _user_has_welcome_delivery(conn, user_id: str) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM platform_outreach_delivery
        WHERE user_id = %s AND template_key LIKE 'welcome_%%'
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    return row is not None


def _pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def _get_or_create_thread(conn, user_id: str, peer_id: str) -> str:
    low, high = _pair(user_id, peer_id)
    row = conn.execute(
        "SELECT id FROM direct_thread WHERE user_low_id = %s AND user_high_id = %s",
        (low, high),
    ).fetchone()
    if row:
        return str(row[0])
    row = conn.execute(
        "INSERT INTO direct_thread (user_low_id, user_high_id) VALUES (%s, %s) RETURNING id",
        (low, high),
    ).fetchone()
    return str(row[0])


def _ensure_official_user(conn) -> str:
    uid = _official_support_uuid()
    conn.execute(
        "INSERT INTO users (id, display_name, handle) VALUES (%s, %s, %s) "
        "ON CONFLICT (id) DO UPDATE SET "
        "display_name = EXCLUDED.display_name, handle = COALESCE(users.handle, EXCLUDED.handle)",
        (uid, OFFICIAL_DISPLAY_NAME, "official"),
    )
    return uid


def send_official_dm(
    conn,
    user_id: str,
    *,
    kind: str = "notice",
    body: str,
    ref: str | None,
    template_key: str | None = None,
    job_id: str | None = None,
    pin_days: int = 0,
) -> str | None:
    """服务端代发官方消息；template_key / job_id 用于幂等。返回 message_id 或 None（已发）。"""
    from .im_schema import ensure_social_im_v12

    ensure_social_im_v12(conn)
    ensure_outreach_schema(conn)
    official_id = _ensure_official_user(conn)

    if template_key:
        dup = conn.execute(
            "SELECT message_id::text FROM platform_outreach_delivery "
            "WHERE user_id = %s AND template_key = %s",
            (user_id, template_key),
        ).fetchone()
        if dup and dup[0]:
            return None

    if job_id:
        dup = conn.execute(
            "SELECT message_id::text FROM platform_outreach_delivery "
            "WHERE user_id = %s AND job_id = %s",
            (user_id, job_id),
        ).fetchone()
        if dup and dup[0]:
            return None

    tid = _get_or_create_thread(conn, user_id, official_id)
    row = conn.execute(
        """
        INSERT INTO direct_message (thread_id, sender_id, kind, body, ref)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        (tid, official_id, kind, body, ref),
    ).fetchone()
    msg_id = str(row[0])

    conn.execute(
        """
        INSERT INTO platform_outreach_delivery (user_id, template_key, job_id, message_id)
        VALUES (%s, %s, %s, %s)
        """,
        (user_id, template_key, job_id, msg_id),
    )

    if pin_days > 0:
        pinned = datetime.now(timezone.utc)
        conn.execute(
            """
            INSERT INTO conversation_state (
              user_id, scope, ref_id, pinned_at, updated_at
            )
            VALUES (%s, 'dm', %s, %s, now())
            ON CONFLICT (user_id, scope, ref_id) DO UPDATE SET
              pinned_at = COALESCE(conversation_state.pinned_at, EXCLUDED.pinned_at),
              updated_at = now()
            """,
            (user_id, tid, pinned),
        )

    invalidate_realtime_cursors([user_id])
    try:
        from ..push.digest_scheduler import schedule_dm_peer

        schedule_dm_peer(user_id, priority=False)
    except Exception:
        logger.exception("welcome push schedule failed user=%s", user_id[:8])
    return msg_id


def send_welcome_if_needed(user_id: str) -> bool:
    """欢迎 notice（幂等）：尚无 welcome_* 投递时发一条，含产品说明入口。"""
    pool = get_pool()
    try:
        with pool.connection() as conn:
            ensure_outreach_schema(conn)
            if _user_has_welcome_delivery(conn, user_id):
                return False
            mid = send_official_dm(
                conn,
                user_id,
                kind="notice",
                body=welcome_notice_body(),
                ref=welcome_notice_ref_json(),
                template_key=WELCOME_TEMPLATE_KEY,
                pin_days=WELCOME_PIN_DAYS,
            )
            conn.commit()
            return mid is not None
    except Exception:
        logger.exception("send_welcome_if_needed failed user=%s", user_id[:8])
        return False


def _month_broadcast_count(conn) -> int:
    row = conn.execute(
        """
        SELECT count(*)::int FROM platform_outreach_job
        WHERE kind = 'broadcast'
          AND status = 'done'
          AND sent_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
        """
    ).fetchone()
    return int(row[0] or 0) if row else 0


def _notice_ref_for_job(title: str | None, ref_json) -> str:
    notice_ref = json.dumps(
        {"title": title or "彼爱团队", "actions": []},
        ensure_ascii=False,
    )
    if ref_json:
        try:
            if isinstance(ref_json, dict):
                notice_ref = json.dumps(ref_json, ensure_ascii=False)
            else:
                notice_ref = str(ref_json)
        except Exception:
            pass
    return notice_ref


def _load_broadcast_targets(conn, audience: str) -> list[str]:
    if audience == "active_30d":
        user_rows = conn.execute(
            """
            SELECT DISTINCT user_id::text FROM accounts
            WHERE updated_at >= now() - interval '30 days'
            """
        ).fetchall()
    else:
        user_rows = conn.execute("SELECT DISTINCT user_id::text FROM accounts").fetchall()
    official_id = _official_support_uuid()
    return [r[0] for r in user_rows if r[0] and r[0] != official_id]


def enqueue_broadcast_job(job_id: str) -> dict:
    """校验并入队；由 outreach_worker 异步发送。"""
    pool = get_pool()
    with pool.connection() as conn:
        ensure_outreach_schema(conn)
        if _month_broadcast_count(conn) >= BROADCAST_MAX_PER_MONTH:
            raise ValueError("本月全员信已达上限")
        job = conn.execute(
            "SELECT kind, audience, status FROM platform_outreach_job WHERE id = %s",
            (job_id,),
        ).fetchone()
        if not job:
            raise ValueError("任务不存在")
        if job[0] != "broadcast":
            raise ValueError("仅 broadcast 可群发")
        if job[2] == "queued":
            conn.commit()
            try:
                from .outreach_worker import wake_outreach_worker

                wake_outreach_worker()
            except Exception:
                logger.exception("wake outreach worker failed job=%s", job_id[:8])
            row = conn.execute(
                "SELECT total_targets FROM platform_outreach_job WHERE id = %s",
                (job_id,),
            ).fetchone()
            return {
                "ok": True,
                "status": "queued",
                "job_id": job_id,
                "total_targets": int(row[0] or 0) if row else 0,
            }
        if job[2] not in ("draft", "failed"):
            raise ValueError("任务状态不可发送")

        conn.execute("DELETE FROM platform_outreach_queue WHERE job_id = %s", (job_id,))
        targets = _load_broadcast_targets(conn, job[1])
        for uid in targets:
            conn.execute(
                """
                INSERT INTO platform_outreach_queue (job_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (job_id, user_id) DO NOTHING
                """,
                (job_id, uid),
            )
        conn.execute(
            """
            UPDATE platform_outreach_job
            SET status = 'queued',
                total_targets = %s,
                sent_count = 0,
                skipped_count = 0,
                failed_count = 0,
                sent_at = NULL
            WHERE id = %s
            """,
            (len(targets), job_id),
        )
        conn.commit()

    try:
        from .outreach_worker import wake_outreach_worker

        wake_outreach_worker()
    except Exception:
        logger.exception("wake outreach worker failed job=%s", job_id[:8])

    return {
        "ok": True,
        "status": "queued",
        "job_id": job_id,
        "total_targets": len(targets),
    }


def process_broadcast_batch(job_id: str, *, limit: int = 40) -> dict:
    """Worker 单批发送。"""
    pool = get_pool()
    sent = skipped = failed = 0
    with pool.connection() as conn:
        ensure_outreach_schema(conn)
        job = conn.execute(
            "SELECT kind, body, ref, status FROM platform_outreach_job WHERE id = %s",
            (job_id,),
        ).fetchone()
        if not job or job[0] != "broadcast":
            return {"sent": 0, "skipped": 0, "failed": 0, "pending": 0}
        body, ref_json, status = job[1], job[2], job[3]
        if status not in ("queued", "sending"):
            return {"sent": 0, "skipped": 0, "failed": 0, "pending": 0}

        title_row = conn.execute(
            "SELECT title FROM platform_outreach_job WHERE id = %s",
            (job_id,),
        ).fetchone()
        notice_ref = _notice_ref_for_job(title_row[0] if title_row else None, ref_json)

        if status == "queued":
            conn.execute(
                "UPDATE platform_outreach_job SET status = 'sending' WHERE id = %s",
                (job_id,),
            )

        try:
            rows = conn.execute(
                """
                SELECT user_id::text
                FROM platform_outreach_queue
                WHERE job_id = %s AND done_at IS NULL
                ORDER BY user_id
                LIMIT %s
                FOR UPDATE SKIP LOCKED
                """,
                (job_id, max(1, limit)),
            ).fetchall()
        except Exception:
            conn.rollback()
            rows = conn.execute(
                """
                SELECT user_id::text
                FROM platform_outreach_queue
                WHERE job_id = %s AND done_at IS NULL
                ORDER BY user_id
                LIMIT %s
                """,
                (job_id, max(1, limit)),
            ).fetchall()

        conn.commit()

    uids = [r[0] for r in rows]
    for uid in uids:
        try:
            with pool.connection() as c2:
                mid = send_official_dm(
                    c2,
                    uid,
                    kind="notice",
                    body=body,
                    ref=notice_ref,
                    job_id=job_id,
                )
                c2.execute(
                    """
                    UPDATE platform_outreach_queue
                    SET done_at = now(), last_error = NULL
                    WHERE job_id = %s AND user_id = %s
                    """,
                    (job_id, uid),
                )
                if mid:
                    sent += 1
                else:
                    skipped += 1
                c2.commit()
        except Exception as exc:
            failed += 1
            logger.exception("broadcast batch user=%s job=%s", uid[:8], job_id[:8])
            try:
                with pool.connection() as c3:
                    c3.execute(
                        """
                        UPDATE platform_outreach_queue
                        SET done_at = now(), last_error = %s
                        WHERE job_id = %s AND user_id = %s
                        """,
                        (str(exc)[:200], job_id, uid),
                    )
                    c3.commit()
            except Exception:
                pass

    with pool.connection() as conn:
        if sent or skipped or failed:
            conn.execute(
                """
                UPDATE platform_outreach_job
                SET sent_count = sent_count + %s,
                    skipped_count = skipped_count + %s,
                    failed_count = failed_count + %s
                WHERE id = %s
                """,
                (sent, skipped, failed, job_id),
            )
        pending_row = conn.execute(
            "SELECT count(*)::int FROM platform_outreach_queue "
            "WHERE job_id = %s AND done_at IS NULL",
            (job_id,),
        ).fetchone()
        pending = int(pending_row[0] or 0) if pending_row else 0
        conn.commit()

    return {"sent": sent, "skipped": skipped, "failed": failed, "pending": pending}


def official_friend_dict() -> dict:
    return {
        "user_id": _official_support_uuid(),
        "handle": "official",
        "display_name": OFFICIAL_DISPLAY_NAME,
        "avatar_id": "official_app",
        "user_code": OFFICIAL_SUPPORT_USER_CODE,
        "relation": "platform_official",
        "pinned": True,
        "removable": False,
    }
