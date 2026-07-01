"""Web Push：VAPID 公钥、订阅登记、摘要投递。"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from ..auth.session import get_current_user
from ..config import get_settings
from ..db import get_pool
from ..social.router import push_digest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class ReminderPrefs(BaseModel):
    enabled: bool = False
    hour: int = 8
    minute: int = 0
    streak_recall: bool = False
    group_digest: bool = False


class SubscribeBody(BaseModel):
    endpoint: str
    keys: PushKeys
    reminder: ReminderPrefs | None = None


def _send_webpush(sub: dict, payload: dict) -> bool:
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
        logger.warning("webpush failed endpoint=%s status=%s", sub["endpoint"][:48], e.response.status_code if e.response else "?")
        if e.response and e.response.status_code in (404, 410):
            pool = get_pool()
            with pool.connection() as conn:
                conn.execute(
                    "DELETE FROM push_subscription WHERE endpoint = %s",
                    (sub["endpoint"],),
                )
                conn.commit()
        return False


@router.get("/vapid-public-key")
def vapid_public_key() -> dict:
    s = get_settings()
    if not s.vapid_public_key:
        raise HTTPException(503, "Web Push 未配置 VAPID 公钥")
    return {"public_key": s.vapid_public_key}


@router.post("/subscribe")
def subscribe(body: SubscribeBody, user_id: str = Depends(get_current_user)) -> dict:
    if not body.endpoint.strip():
        raise HTTPException(400, "endpoint 不能为空")
    rem = body.reminder or ReminderPrefs()
    pool = get_pool()
    with pool.connection() as conn:
        conn.execute(
            "INSERT INTO users (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
            (user_id,),
        )
        conn.execute(
            "INSERT INTO push_subscription "
            "(user_id, endpoint, p256dh, auth, reminder_enabled, reminder_hour, "
            " reminder_minute, streak_recall, group_digest) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (user_id, endpoint) DO UPDATE SET "
            "p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, "
            "reminder_enabled = EXCLUDED.reminder_enabled, "
            "reminder_hour = EXCLUDED.reminder_hour, "
            "reminder_minute = EXCLUDED.reminder_minute, "
            "streak_recall = EXCLUDED.streak_recall, "
            "group_digest = EXCLUDED.group_digest",
            (
                user_id,
                body.endpoint.strip(),
                body.keys.p256dh,
                body.keys.auth,
                rem.enabled,
                rem.hour if rem.enabled else None,
                rem.minute,
                rem.streak_recall,
                rem.group_digest,
            ),
        )
        conn.commit()
    return {"ok": True}


@router.post("/deliver-digest")
def deliver_digest(user_id: str = Depends(get_current_user)) -> dict:
    """向当前用户已登记设备投递 F1 聚合摘要（Web Push）。"""
    digest = push_digest(user_id)
    payload = {
        "title": digest.get("title", "今日共读"),
        "body": digest.get("body", ""),
        "href": digest.get("href", "/discover"),
    }
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT endpoint, p256dh, auth FROM push_subscription WHERE user_id = %s",
            (user_id,),
        ).fetchall()
    sent = 0
    for r in rows:
        if _send_webpush({"endpoint": r[0], "p256dh": r[1], "auth": r[2]}, payload):
            sent += 1
    return {"ok": True, "sent": sent, "devices": len(rows)}


@router.post("/cron/tick")
def cron_tick(
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
) -> dict:
    """定时任务：按订阅里登记的本地时段投递提醒（需配置 PUSH_CRON_SECRET）。"""
    s = get_settings()
    if not s.push_cron_secret or x_cron_secret != s.push_cron_secret:
        raise HTTPException(403, "无效 cron 密钥")
    now = datetime.now(timezone.utc)
    # 默认按 UTC+8 本地钟面（中国用户）；后续可扩展 user timezone
    local_h = (now.hour + 8) % 24
    local_m = now.minute
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT user_id, endpoint, p256dh, auth FROM push_subscription "
            "WHERE reminder_enabled AND reminder_hour = %s "
            "AND reminder_minute BETWEEN %s AND %s",
            (local_h, max(0, local_m - 7), min(59, local_m + 7)),
        ).fetchall()
    sent = 0
    for user_id, endpoint, p256dh, auth in rows:
        digest = push_digest(str(user_id))
        payload = {
            "title": digest.get("title", "彼爱"),
            "body": digest.get("body", "愿话语成为你脚前的灯"),
            "href": digest.get("href", "/"),
        }
        if _send_webpush(
            {"endpoint": endpoint, "p256dh": p256dh, "auth": auth},
            payload,
        ):
            sent += 1
    return {"ok": True, "matched": len(rows), "sent": sent}
