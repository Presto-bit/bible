"""统一推送投递：Web Push 与 FCM。"""
from __future__ import annotations

from .fcm_send import send_fcm
from .webpush_send import send_webpush


def send_push_subscription(sub: dict, payload: dict) -> bool:
    endpoint = (sub.get("endpoint") or "").strip()
    if endpoint.startswith("fcm:"):
        return send_fcm(endpoint[4:], payload)
    return send_webpush(sub, payload)
