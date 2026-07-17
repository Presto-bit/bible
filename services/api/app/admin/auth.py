"""管理员鉴权：手机号 + 密码 → HMAC 令牌。"""
from __future__ import annotations

import base64
import hashlib
import hmac
import time

from fastapi import Header, HTTPException

from ..config import get_settings

_TOKEN_TTL_SEC = 7 * 24 * 3600
_WEAK_PASSWORDS = frozenset({"", "123456", "admin", "password", "passw0rd", "bible-admin"})


def _secret() -> str:
    s = get_settings()
    # 不与 push_cron / session 耦合
    secret = (s.admin_token_secret or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="管理员令牌密钥未配置（ADMIN_TOKEN_SECRET）")
    return secret


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
    except HTTPException:
        raise
    except Exception:
        return None


def phone_is_admin(phone: str | None) -> bool:
    if not phone:
        return False
    s = get_settings()
    admin = _normalize_phone(s.admin_phone)
    if not admin:
        return False
    return _normalize_phone(phone) == admin


def verify_admin_credentials(phone: str, password: str) -> bool:
    s = get_settings()
    pwd = (s.admin_password or "").strip()
    if not pwd or pwd.lower() in _WEAK_PASSWORDS:
        return False
    if not phone_is_admin(phone):
        return False
    return hmac.compare_digest(password or "", pwd)


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
