"""向已开启 group_digest 的设备投递聚合摘要。"""
from __future__ import annotations

import logging

from ..db import get_pool
from ..social.router import push_digest
from .webpush_send import send_webpush

logger = logging.getLogger(__name__)


def deliver_group_digest(user_id: str, *, require_unread: bool = False) -> int:
    """投递摘要；require_unread=True 时仅在有未读消息时发送（发消息 debounce 用）。"""
    digest = push_digest(user_id)
    unread = int(digest.get("unread") or 0)
    body = (digest.get("body") or "").strip()
    if require_unread and unread <= 0:
        return 0
    if not body or body == "近期没有需要处理的消息":
        return 0
    payload = {
        "title": digest.get("title", "消息摘要"),
        "body": body,
        "href": digest.get("href", "/discover"),
    }
    pool = get_pool()
    with pool.connection() as conn:
        try:
            rows = conn.execute(
                "SELECT endpoint, p256dh, auth FROM push_subscription "
                "WHERE user_id = %s AND COALESCE(group_digest, false) = true",
                (user_id,),
            ).fetchall()
        except Exception:
            # 缺 group_digest 列时不扩大投递面（避免推给未开聚合的订阅）
            logger.warning(
                "digest push query failed user=%s (skip; check push_subscription schema)",
                user_id[:8],
            )
            return 0
    sent = 0
    for r in rows:
        if send_webpush({"endpoint": r[0], "p256dh": r[1], "auth": r[2]}, payload):
            sent += 1
    if sent:
        logger.info("digest push user=%s unread=%s sent=%s", user_id[:8], unread, sent)
    return sent
