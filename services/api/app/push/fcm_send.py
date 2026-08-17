"""Android FCM 投递（HTTP v1 或 Legacy Server Key）。"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import httpx

from ..config import get_settings
from ..db import get_pool

logger = logging.getLogger(__name__)

_token_cache: dict[str, object] = {"exp": 0.0, "token": ""}


def _access_token_v1() -> str | None:
    s = get_settings()
    path = (s.fcm_service_account_json or "").strip()
    if not path:
        return None
    p = Path(path)
    if not p.is_file():
        logger.warning("FCM service account file missing: %s", path)
        return None
    now = time.time()
    cached = _token_cache.get("token")
    if cached and now < float(_token_cache.get("exp") or 0):
        return str(cached)
    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests
    except ImportError:
        logger.warning("google-auth 未安装，无法使用 FCM HTTP v1")
        return None
    creds = service_account.Credentials.from_service_account_file(
        str(p),
        scopes=["https://www.googleapis.com/auth/firebase.messaging"],
    )
    creds.refresh(google.auth.transport.requests.Request())
    _token_cache["token"] = creds.token
    _token_cache["exp"] = now + 3300
    return creds.token


def _purge_fcm_token(token: str) -> None:
    endpoint = f"fcm:{token}"
    pool = get_pool()
    with pool.connection() as conn:
        conn.execute("DELETE FROM push_subscription WHERE endpoint = %s", (endpoint,))
        conn.commit()


def send_fcm(token: str, payload: dict) -> bool:
    """向单个 FCM 设备 token 投递；payload 含 title/body/href。"""
    t = token.strip()
    if not t:
        return False
    title = (payload.get("title") or "彼爱").strip()
    body = (payload.get("body") or "").strip()
    href = (payload.get("href") or "/discover").strip()
    if not body:
        return False

    s = get_settings()
    data = {"href": href, "title": title, "body": body}

    # HTTP v1（推荐）
    project_id = (s.fcm_project_id or "").strip()
    access = _access_token_v1()
    if project_id and access:
        url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
        body_json = {
            "message": {
                "token": t,
                "notification": {"title": title, "body": body},
                "data": {k: str(v) for k, v in data.items()},
                "android": {"priority": "HIGH"},
            }
        }
        try:
            with httpx.Client(timeout=15.0) as client:
                r = client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {access}",
                        "Content-Type": "application/json",
                    },
                    json=body_json,
                )
            if r.status_code == 200:
                return True
            logger.warning("FCM v1 failed token=%s status=%s body=%s", t[:12], r.status_code, r.text[:200])
            if r.status_code in (404, 410) or "NOT_FOUND" in r.text or "UNREGISTERED" in r.text:
                _purge_fcm_token(t)
            return False
        except Exception as e:
            logger.warning("FCM v1 error token=%s err=%s", t[:12], e)
            return False

    # Legacy Server Key（兼容旧项目）
    key = (s.fcm_server_key or "").strip()
    if not key:
        return False
    legacy = {
        "to": t,
        "priority": "high",
        "notification": {"title": title, "body": body},
        "data": data,
    }
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(
                "https://fcm.googleapis.com/fcm/send",
                headers={
                    "Authorization": f"key={key}",
                    "Content-Type": "application/json",
                },
                json=legacy,
            )
        if r.status_code != 200:
            logger.warning("FCM legacy failed token=%s status=%s", t[:12], r.status_code)
            return False
        resp = r.json()
        if resp.get("failure", 0):
            results = resp.get("results") or []
            for item in results:
                err = (item.get("error") or "").upper()
                if err in ("NOT_REGISTERED", "INVALID_REGISTRATION", "MISMATCHSENDERID"):
                    _purge_fcm_token(t)
                    return False
            return False
        return True
    except Exception as e:
        logger.warning("FCM legacy error token=%s err=%s", t[:12], e)
        return False
