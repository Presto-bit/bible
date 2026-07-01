"""认证相关：免注册账号（10 位 ID + 用户名/密码）+ 开发登录 + 游客合并。"""
from __future__ import annotations

import hashlib
import logging
import secrets
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from ..config import get_settings
from ..db import get_pool
from .session import get_current_user
from .user_code import CODE_RE as _CODE_RE
from .user_code import uuid_for_code as _uuid_for_code

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

_DEV_NS = uuid.UUID("6f1a0c2e-9b3d-4e7a-8c1f-b1b1e0000000")


def _hash_pwd(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


class DevLoginBody(BaseModel):
    handle: str
    display_name: str | None = None


@router.post("/dev-login")
def dev_login(body: DevLoginBody) -> dict:
    """开发登录：按 handle 生成稳定 user_id 并落 users 表。

    契约与 orchestrator 一致（返回 user_id），生产环境改用 Bearer + /auth/me。
    仅在 AUTH_DEV_ALLOW_USER_HEADER=true 且未配 orchestrator 时可用。
    """
    s = get_settings()
    if not (s.auth_dev_allow_user_header and not s.orchestrator_base_url):
        raise HTTPException(status_code=403, detail="开发登录未启用")
    handle = body.handle.strip()
    if not handle:
        raise HTTPException(status_code=400, detail="handle 不能为空")
    user_id = str(uuid.uuid5(_DEV_NS, handle))
    display = (body.display_name or handle).strip()
    pool = get_pool()
    with pool.connection() as conn:
        conn.execute(
            "INSERT INTO users (id, handle, display_name) VALUES (%s, %s, %s) "
            "ON CONFLICT (id) DO UPDATE SET handle = EXCLUDED.handle, "
            "display_name = EXCLUDED.display_name",
            (user_id, handle, display),
        )
        conn.commit()
    return {"user_id": user_id, "handle": handle, "display_name": display}


@router.get("/whoami")
def whoami(user_id: str = Depends(get_current_user)) -> dict:
    """校验当前凭证（Bearer 令牌 / Cookie / 开发头）并返回 user_id。

    正式登录流程：客户端从 orchestrator 取得 opaque 会话令牌后，带
    Authorization: Bearer 调用本接口校验并取 user_id，再持久化登录态。
    """
    return {"user_id": user_id}


@router.post("/merge-guest")
def merge_guest(
    user_id: str = Depends(get_current_user),
    x_guest_id: str | None = Header(default=None),
) -> dict:
    """登录后把游客设备的 AI 用量归并到用户名下。

    用户业务数据为本地优先：登录后由客户端 /sync/push 上行，无需服务端搬运。
    这里仅迁移服务端持有的游客侧计数（ai_usage_daily）。
    """
    if not x_guest_id:
        return {"ok": True, "merged": False, "reason": "no_guest_id"}
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT guest_id FROM guest_devices WHERE device_fingerprint = %s",
            (x_guest_id,),
        ).fetchone()
        if not row:
            conn.commit()
            return {"ok": True, "merged": False, "reason": "guest_not_found"}
        guest_id = row[0]
        # 确保用户行存在（orchestrator 校验过身份；本地落一行以满足外键）
        conn.execute(
            "INSERT INTO users (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
            (user_id,),
        )
        conn.execute(
            "UPDATE ai_usage_daily SET user_id = %s WHERE guest_id = %s AND user_id IS NULL",
            (user_id, guest_id),
        )
        conn.commit()
    return {"ok": True, "merged": True, "user_id": user_id}


# ── 免注册账号体系：10 位 ID 唯一标识，用户名唯一，可选密码 ──


class RegisterBody(BaseModel):
    user_code: str
    username: str | None = None
    password: str | None = None


class LoginBody(BaseModel):
    identifier: str
    password: str | None = None


@router.get("/username-available")
def username_available(u: str) -> dict:
    """用户名是否可用（唯一）。后端不可用时由客户端本地兜底。"""
    name = (u or "").strip()
    if not name:
        return {"available": False}
    try:
        pool = get_pool()
        with pool.connection() as conn:
            row = conn.execute(
                "SELECT 1 FROM accounts WHERE lower(username) = lower(%s)",
                (name,),
            ).fetchone()
        return {"available": row is None}
    except Exception as exc:  # DB 不可用：交由客户端本地校验
        logger.warning("username-available 查询失败：%s", exc)
        return {"available": True, "degraded": True}


@router.post("/register")
def register(body: RegisterBody) -> dict:
    """按 10 位用户ID 建档（免注册即用），可同时设置用户名 + 密码。"""
    code = body.user_code.strip()
    if not _CODE_RE.match(code):
        raise HTTPException(status_code=400, detail="用户ID 必须为 10 位数字")
    name = (body.username or "").strip() or None
    user_id = _uuid_for_code(code)
    pwd_hash = pwd_salt = None
    if body.password:
        pwd_salt = secrets.token_hex(8)
        pwd_hash = _hash_pwd(body.password, pwd_salt)
    try:
        pool = get_pool()
        with pool.connection() as conn:
            if name:
                taken = conn.execute(
                    "SELECT user_code FROM accounts WHERE lower(username) = lower(%s)",
                    (name,),
                ).fetchone()
                if taken and taken[0] != code:
                    raise HTTPException(status_code=409, detail="用户名已被占用")
            conn.execute(
                "INSERT INTO users (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
                (user_id,),
            )
            conn.execute(
                """
                INSERT INTO accounts (user_code, user_id, username, pwd_hash, pwd_salt, updated_at)
                VALUES (%s, %s, %s, %s, %s, now())
                ON CONFLICT (user_code) DO UPDATE SET
                  username = COALESCE(EXCLUDED.username, accounts.username),
                  pwd_hash = COALESCE(EXCLUDED.pwd_hash, accounts.pwd_hash),
                  pwd_salt = COALESCE(EXCLUDED.pwd_salt, accounts.pwd_salt),
                  updated_at = now()
                """,
                (code, user_id, name, pwd_hash, pwd_salt),
            )
            conn.commit()
        return {"ok": True, "user_code": code, "user_id": user_id, "username": name}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("register 失败（DB 不可用）：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用，已本地保存") from exc


@router.post("/login")
def login(body: LoginBody) -> dict:
    """登录：identifier 为 10 位用户ID（可空密码）或用户名（需密码）。"""
    idf = body.identifier.strip()
    if not idf:
        raise HTTPException(status_code=400, detail="请输入用户ID或用户名")
    try:
        pool = get_pool()
        with pool.connection() as conn:
            if _CODE_RE.match(idf):
                row = conn.execute(
                    "SELECT user_code, username, pwd_hash, pwd_salt FROM accounts WHERE user_code = %s",
                    (idf,),
                ).fetchone()
                # 免注册：未建档的 ID 也允许直接登录（采用该身份）
                if row is None:
                    return {"user_code": idf, "user_id": _uuid_for_code(idf), "username": None}
            else:
                row = conn.execute(
                    "SELECT user_code, username, pwd_hash, pwd_salt FROM accounts WHERE lower(username) = lower(%s)",
                    (idf,),
                ).fetchone()
                if row is None:
                    raise HTTPException(status_code=401, detail="用户名或密码错误")
            code, username, pwd_hash, pwd_salt = row
            if pwd_hash:
                if not body.password or _hash_pwd(body.password, pwd_salt or "") != pwd_hash:
                    raise HTTPException(status_code=401, detail="密码不正确")
            elif not _CODE_RE.match(idf):
                # 用户名账号但未设密码 → 不允许用户名登录
                raise HTTPException(status_code=401, detail="该账号未设置密码，请用用户ID登录")
            return {"user_code": code, "user_id": _uuid_for_code(code), "username": username}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("login 失败（DB 不可用）：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用") from exc
