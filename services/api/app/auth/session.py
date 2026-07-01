"""解析当前用户（复用 orchestrator opaque session）。

优先级：
  1. Authorization: Bearer <opaque>  → 调 orchestrator /api/v1/auth/me 校验取 user_id
  2. Cookie fym_session（Web /2sc BFF）→ 同上（带 Cookie 转发）
  3. 开发期 X-User-Id 头（auth_dev_allow_user_header=True 且未配 orchestrator）

校验失败抛 401。
"""
from __future__ import annotations

import logging

import httpx
from fastapi import Header, HTTPException

from ..config import get_settings

logger = logging.getLogger(__name__)


def _verify_with_orchestrator(token: str | None, cookie: str | None) -> str | None:
    s = get_settings()
    if not s.orchestrator_base_url:
        return None
    url = s.orchestrator_base_url.rstrip("/") + s.auth_me_path
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if cookie:
        headers["Cookie"] = f"fym_session={cookie}"
    if not headers:
        return None
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url, headers=headers)
        if resp.status_code != 200:
            return None
        data = resp.json()
        uid = data.get("user_id") or data.get("id") or (data.get("user") or {}).get("id")
        return str(uid) if uid else None
    except Exception as exc:
        logger.warning("orchestrator /auth/me 校验失败：%s", exc)
        return None


def get_current_user(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    cookie: str | None = Header(default=None),
) -> str:
    s = get_settings()
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    fym = None
    if cookie:
        for part in cookie.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "fym_session":
                fym = v

    uid = _verify_with_orchestrator(token, fym)
    if uid:
        return uid

    if s.auth_dev_allow_user_header and not s.orchestrator_base_url and x_user_id:
        return x_user_id.strip()

    raise HTTPException(status_code=401, detail="未认证")
