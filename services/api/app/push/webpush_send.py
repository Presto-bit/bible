"""底层 Web Push 发送。"""
from __future__ import annotations

import json
import logging

from ..config import get_settings
from ..db import get_pool

logger = logging.getLogger(__name__)


def send_webpush(sub: dict, payload: dict) -> bool:
    s = get_settings()
    if not s.vapid_private_key or not s.vapid_public_key:
        return False
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush 未安装，跳过 Web Push 投递")
        return False
    try:
        webpush(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=s.vapid_private_key,
            vapid_claims={"sub": s.vapid_subject},
        )
        return True
    except WebPushException as e:
        logger.warning(
            "webpush failed endpoint=%s status=%s",
            sub["endpoint"][:48],
            e.response.status_code if e.response else "?",
        )
        if e.response and e.response.status_code in (404, 410):
            pool = get_pool()
            with pool.connection() as conn:
                conn.execute(
                    "DELETE FROM push_subscription WHERE endpoint = %s",
                    (sub["endpoint"],),
                )
                conn.commit()
        return False
