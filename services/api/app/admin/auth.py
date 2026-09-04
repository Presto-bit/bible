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


def shelf_admin_identities() -> set[str]:
    """书柜管理员身份集合（规范化手机号 + 原样 user_code）。"""
    s = get_settings()
    out: set[str] = set()
    raw = (s.shelf_admin_user_codes or "").strip()
    for part in raw.replace(";", ",").split(","):
        p = part.strip()
        if not p:
            continue
        out.add(p)
        out.add(_normalize_phone(p))
    admin = _normalize_phone(s.admin_phone)
    if admin:
        out.add(admin)
    return {x for x in out if x}


def identity_is_shelf_admin(*, phone: str | None = None, user_code: str | None = None) -> bool:
    if phone_is_admin(phone):
        return True
    allowed = shelf_admin_identities()
    if not allowed:
        return False
    if phone and _normalize_phone(phone) in allowed:
        return True
    if user_code and user_code.strip() in allowed:
        return True
    return False


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


def require_shelf_admin(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
) -> str:
    """全站 Admin 令牌，或登录用户属于 SHELF_ADMIN_USER_CODES。"""
    from ..auth.session import resolve_user_id
    from ..db import get_pool

    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_admin_token:
        token = x_admin_token.strip()

    admin_phone = verify_admin_token(token)
    if admin_phone and (
        phone_is_admin(admin_phone) or identity_is_shelf_admin(phone=admin_phone)
    ):
        return admin_phone

    user_id = resolve_user_id(
        authorization=authorization,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    if user_id:
        phone: str | None = None
        user_code: str | None = None
        try:
            pool = get_pool()
            with pool.connection() as conn:
                row = conn.execute(
                    "SELECT phone, user_code FROM accounts WHERE user_id = %s::uuid LIMIT 1",
                    (user_id,),
                ).fetchone()
            if row:
                phone = row[0]
                user_code = row[1]
        except Exception:
            phone = None
            user_code = None
        if identity_is_shelf_admin(phone=phone, user_code=user_code):
            return (user_code or phone or user_id).strip()

    raise HTTPException(status_code=403, detail="需要书柜管理员权限")
