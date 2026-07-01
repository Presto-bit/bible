"""解析当前用户（复用 orchestrator opaque session）。

优先级：
  1. Authorization: Bearer / Cookie fym_session → orchestrator /auth/me
  2. 未配 orchestrator 时：X-User-Code / X-User-Id（10 位数字）→ 稳定 UUID
  3. 开发期任意 X-User-Id（auth_dev_allow_user_header=True 且未配 orchestrator）

校验失败抛 401。
"""
from __future__ import annotations

import logging

import httpx
from fastapi import Header, HTTPException

from ..config import get_settings
from ..db import get_pool
from .user_code import pick_user_code, uuid_for_code

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


def _ensure_user_row(user_uuid: str) -> None:
    try:
        pool = get_pool()
        with pool.connection() as conn:
            conn.execute(
                "INSERT INTO users (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
                (user_uuid,),
            )
            conn.commit()
    except Exception as exc:
        logger.warning("ensure users 行失败：%s", exc)


def get_current_user(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
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

    # Bible 独立部署：H5/移动端 10 位用户 ID（免注册）→ UUID，满足 social 外键
    if not s.orchestrator_base_url:
        code = pick_user_code(x_user_code, x_user_id)
        if code:
            user_uuid = uuid_for_code(code)
            _ensure_user_row(user_uuid)
            return user_uuid

    if s.auth_dev_allow_user_header and not s.orchestrator_base_url and x_user_id:
        return x_user_id.strip()

    raise HTTPException(status_code=401, detail="未认证")
