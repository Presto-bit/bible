"""管理员鉴权：手机号 + 密码 → HMAC 令牌。"""
from __future__ import annotations

import base64
import hashlib
import hmac
import time

from fastapi import Header, HTTPException

from ..config import get_settings

_TOKEN_TTL_SEC = 7 * 24 * 3600


def _secret() -> str:
    s = get_settings()
    return s.admin_token_secret or s.push_cron_secret or s.admin_password or "bible-admin"


def _normalize_phone(raw: str) -> str:
    return (raw or "").strip().replace(" ", "").replace("-", "")


def make_admin_token(phone: str) -> str:
    exp = int(time.time()) + _TOKEN_TTL_SEC
    payload = f"{_normalize_phone(phone)}:{exp}"
    sig = hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def verify_admin_token(token: str | None) -> str | None:
    if not token:
        return None
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        phone, exp_str, sig = decoded.rsplit(":", 2)
        payload = f"{phone}:{exp_str}"
        expected = hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        if int(exp_str) < int(time.time()):
            return None
        return phone
    except Exception:
        return None


def phone_is_admin(phone: str | None) -> bool:
    if not phone:
        return False
    s = get_settings()
    return _normalize_phone(phone) == _normalize_phone(s.admin_phone)


def verify_admin_credentials(phone: str, password: str) -> bool:
    s = get_settings()
    return phone_is_admin(phone) and (password or "") == s.admin_password


def require_admin(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> str:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_admin_token:
        token = x_admin_token.strip()
    phone = verify_admin_token(token)
    if not phone:
        raise HTTPException(status_code=401, detail="需要管理员登录")
    return phone
