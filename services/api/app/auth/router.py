"""认证相关：免注册账号（10 位 ID + 用户名/密码）+ 开发登录 + 游客合并。"""
from __future__ import annotations

import hashlib
import logging
import secrets
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from ..config import get_settings
from ..content.engagement_migrate import migrate_daily_verse_engagement
from ..db import get_pool
from .session import get_current_user
from .user_code import is_user_code, pick_user_code, uuid_for_code as _uuid_for_code

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


class ChangePasswordBody(BaseModel):
    user_code: str
    old_password: str | None = None
    new_password: str


class BindPhoneBody(BaseModel):
    phone: str
    password: str | None = None


_PHONE_RE = __import__("re").compile(r"^1[3-9]\d{9}$")


def _normalize_phone(raw: str) -> str:
    return (raw or "").strip().replace(" ", "").replace("-", "")


def _account_row(conn, user_code: str):
    return conn.execute(
        "SELECT user_code, username, pwd_hash, pwd_salt, phone FROM accounts WHERE user_code = %s",
        (user_code,),
    ).fetchone()


def _account_payload(code: str, username: str | None, pwd_hash: str | None, phone: str | None = None) -> dict:
    return {
        "user_code": code,
        "user_id": _uuid_for_code(code),
        "username": username,
        "has_password": bool(pwd_hash),
        "phone": phone,
    }


@router.get("/account-status")
def account_status(user_code: str) -> dict:
    """查询账号建档状态（用户名、是否已设密码）。"""
    code = (user_code or "").strip()
    if not is_user_code(code):
        raise HTTPException(status_code=400, detail="用户ID 必须为 8 位数字")
    try:
        pool = get_pool()
        with pool.connection() as conn:
            row = _account_row(conn, code)
        if row is None:
            return _account_payload(code, None, None, None)
        c, username, pwd_hash, _, phone = row
        return _account_payload(c, username, pwd_hash, phone)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("account-status 查询失败：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用") from exc


@router.post("/change-password")
def change_password(
    body: ChangePasswordBody, user_id: str = Depends(get_current_user),
) -> dict:
    code = body.user_code.strip()
    if not is_user_code(code):
        raise HTTPException(status_code=400, detail="用户ID 必须为 8 位数字")
    if _uuid_for_code(code) != user_id:
        raise HTTPException(status_code=403, detail="身份不匹配")
    new_pwd = (body.new_password or "").strip()
    if len(new_pwd) < 6:
        raise HTTPException(status_code=400, detail="密码至少 6 位")
    try:
        pool = get_pool()
        with pool.connection() as conn:
            row = _account_row(conn, code)
            pwd_hash = pwd_salt = None
            if row:
                _, _, pwd_hash, pwd_salt, _ = row
            if pwd_hash:
                if not body.old_password or _hash_pwd(body.old_password, pwd_salt or "") != pwd_hash:
                    raise HTTPException(status_code=401, detail="当前密码不正确")
            pwd_salt = secrets.token_hex(8)
            pwd_hash = _hash_pwd(new_pwd, pwd_salt)
            conn.execute(
                "INSERT INTO users (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
                (_uuid_for_code(code),),
            )
            conn.execute(
                """
                INSERT INTO accounts (user_code, user_id, pwd_hash, pwd_salt, updated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (user_code) DO UPDATE SET
                  pwd_hash = EXCLUDED.pwd_hash,
                  pwd_salt = EXCLUDED.pwd_salt,
                  updated_at = now()
                """,
                (code, _uuid_for_code(code), pwd_hash, pwd_salt),
            )
            conn.commit()
        return {"ok": True, "has_password": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("change-password 失败：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用") from exc


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


@router.get("/device-user")
def device_user(device_id: str, fingerprint: str | None = None) -> dict:
    """按安装级 device_id 找回 user_code。

    不再使用硬件指纹（fingerprint / dev-*）：同型号手机 GPU/Canvas 常相同，
    会导致两台设备误绑同一账号。fingerprint 参数保留兼容，但忽略。
    """
    del fingerprint  # 明确不参与身份查找
    fp = (device_id or "").strip()
    if not fp or len(fp) > 128:
        raise HTTPException(status_code=400, detail="无效设备标识")
    # 旧版硬件指纹不可用于自动恢复
    if fp.startswith("dev-"):
        return {"user_code": None}
    try:
        pool = get_pool()
        with pool.connection() as conn:
            row = conn.execute(
                "SELECT user_code FROM device_user_bindings WHERE device_fingerprint = %s",
                (fp,),
            ).fetchone()
            if row:
                code = row[0]
                # 账号已清除时视为未绑定，并删掉孤儿绑定，便于客户端自动换新 ID
                acc = conn.execute(
                    "SELECT 1 FROM accounts WHERE user_code = %s",
                    (code,),
                ).fetchone()
                if acc:
                    return {"user_code": code}
                conn.execute(
                    "DELETE FROM device_user_bindings WHERE device_fingerprint = %s",
                    (fp,),
                )
                conn.commit()
        return {"user_code": None}
    except Exception as exc:
        logger.warning("device-user 查询失败：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用") from exc


def _lookup_bound_user_code(conn, *fingerprints: str | None) -> str | None:
    seen: set[str] = set()
    for raw in fingerprints:
        fp = (raw or "").strip()
        if not fp or len(fp) > 128 or fp in seen:
            continue
        seen.add(fp)
        row = conn.execute(
            "SELECT user_code FROM device_user_bindings WHERE device_fingerprint = %s",
            (fp,),
        ).fetchone()
        if row:
            return row[0]
    return None


def _bind_device_user(conn, device_id: str | None, user_code: str) -> None:
    """仅绑定安装级 device_id；拒绝弱硬件指纹 dev-*，避免同型号撞号。"""
    fp = (device_id or "").strip()
    if not fp or not is_user_code(user_code):
        return
    if fp.startswith("dev-"):
        return
    conn.execute(
        """
        INSERT INTO device_user_bindings (device_fingerprint, user_code, updated_at)
        VALUES (%s, %s, now())
        ON CONFLICT (device_fingerprint) DO NOTHING
        """,
        (fp, user_code),
    )


def _maybe_migrate_engagement(conn, from_code: str | None, to_code: str) -> None:
    former = (from_code or "").strip()
    if former and former != to_code:
        migrate_daily_verse_engagement(conn, former, to_code)


@router.post("/register")
def register(
    body: RegisterBody,
    x_device_id: str | None = Header(default=None),
    x_device_fingerprint: str | None = Header(default=None),  # noqa: ARG001 — 兼容旧客户端，忽略
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
) -> dict:
    """按 10 位用户ID 建档（免注册即用），可同时设置用户名 + 密码。"""
    requested = body.user_code.strip()
    code = requested
    if not is_user_code(code):
        raise HTTPException(status_code=400, detail="用户ID 必须为 8 位数字")
    name = (body.username or "").strip() or None
    user_id = _uuid_for_code(code)
    pwd_hash = pwd_salt = None
    if body.password:
        pwd_salt = secrets.token_hex(8)
        pwd_hash = _hash_pwd(body.password, pwd_salt)
    try:
        pool = get_pool()
        with pool.connection() as conn:
            # 仅按安装级 device_id 恢复；不用硬件指纹（同型号会误绑）
            bound = _lookup_bound_user_code(conn, x_device_id)
            if bound:
                code = bound
                user_id = _uuid_for_code(code)
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
            _bind_device_user(conn, x_device_id, code)
            former = pick_user_code(requested, x_user_code)
            _maybe_migrate_engagement(conn, former, code)
            conn.commit()
            row = _account_row(conn, code)
            phone = row[4] if row else None
            uname = (row[1] if row else None) or name
            phash = row[2] if row else pwd_hash
        return {"ok": True, **_account_payload(code, uname, phash, phone)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("register 失败（DB 不可用）：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用，已本地保存") from exc


@router.post("/login")
def login(
    body: LoginBody,
    x_device_id: str | None = Header(default=None),
    x_device_fingerprint: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
) -> dict:
    """登录/恢复：用户ID、用户名、或手机号 + 密码。"""
    idf = body.identifier.strip()
    if not idf:
        raise HTTPException(status_code=400, detail="请输入用户名、手机号或用户ID")
    try:
        pool = get_pool()
        with pool.connection() as conn:
            row = None
            if is_user_code(idf):
                row = conn.execute(
                    "SELECT user_code, username, pwd_hash, pwd_salt, phone FROM accounts WHERE user_code = %s",
                    (idf,),
                ).fetchone()
                if row is None:
                    _bind_device_user(conn, x_device_id, idf)
                    former = pick_user_code(x_user_code)
                    _maybe_migrate_engagement(conn, former, idf)
                    conn.commit()
                    return _account_payload(idf, None, None, None)
            else:
                phone = _normalize_phone(idf)
                if _PHONE_RE.match(phone):
                    row = conn.execute(
                        "SELECT user_code, username, pwd_hash, pwd_salt, phone FROM accounts WHERE phone = %s",
                        (phone,),
                    ).fetchone()
                else:
                    row = conn.execute(
                        "SELECT user_code, username, pwd_hash, pwd_salt, phone FROM accounts WHERE lower(username) = lower(%s)",
                        (idf,),
                    ).fetchone()
                if row is None:
                    raise HTTPException(status_code=401, detail="账号或密码错误")
            code, username, pwd_hash, pwd_salt, phone = row
            if pwd_hash:
                if not body.password or _hash_pwd(body.password, pwd_salt or "") != pwd_hash:
                    raise HTTPException(status_code=401, detail="密码不正确")
            elif not is_user_code(idf):
                raise HTTPException(status_code=401, detail="该账号未设置密码，请用用户ID登录")
            # 仅绑定安装级 device_id，不绑定硬件指纹
            _bind_device_user(conn, x_device_id, code)
            former = pick_user_code(x_user_code, idf if is_user_code(idf) else None)
            _maybe_migrate_engagement(conn, former, code)
            conn.commit()
            return _account_payload(code, username, pwd_hash, phone)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("login 失败（DB 不可用）：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用") from exc


def _require_user_code(
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    code = pick_user_code(x_user_code, x_user_id)
    if not code:
        raise HTTPException(status_code=401, detail="未认证")
    return code


@router.post("/bind-phone")
def bind_phone(
    body: BindPhoneBody,
    user_code: str = Depends(_require_user_code),
    x_device_id: str | None = Header(default=None),
    x_device_fingerprint: str | None = Header(default=None),
) -> dict:
    """绑定手机号（换机恢复）；若已设密码需验证。"""
    phone = _normalize_phone(body.phone)
    if not _PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="请输入有效的大陆手机号")
    try:
        pool = get_pool()
        with pool.connection() as conn:
            row = _account_row(conn, user_code)
            if row is None:
                raise HTTPException(status_code=404, detail="账号不存在")
            code, username, pwd_hash, pwd_salt, _ = row
            if pwd_hash:
                if not body.password or _hash_pwd(body.password, pwd_salt or "") != pwd_hash:
                    raise HTTPException(status_code=401, detail="密码不正确")
            taken = conn.execute(
                "SELECT user_code FROM accounts WHERE phone = %s AND user_code <> %s",
                (phone, user_code),
            ).fetchone()
            if taken:
                raise HTTPException(status_code=409, detail="该手机号已被其他账号绑定")
            conn.execute(
                "UPDATE accounts SET phone = %s, updated_at = now() WHERE user_code = %s",
                (phone, user_code),
            )
            _bind_device_user(conn, x_device_id, code)
            _bind_device_user(conn, x_device_fingerprint, code)
            conn.commit()
        return {"ok": True, "phone": phone, **_account_payload(code, username, pwd_hash, phone)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("bind-phone 失败：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用") from exc


@router.get("/devices")
def list_devices(user_code: str = Depends(_require_user_code)) -> dict:
    """列出已绑定到本账号的设备指纹（不含完整隐私信息）。"""
    try:
        pool = get_pool()
        with pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT device_fingerprint, updated_at
                FROM device_user_bindings
                WHERE user_code = %s
                ORDER BY updated_at DESC
                LIMIT 20
                """,
                (user_code,),
            ).fetchall()
        devices = [
            {
                "id": r[0],
                "label": _device_label(r[0]),
                "updated_at": r[1].isoformat() if r[1] else None,
            }
            for r in rows
        ]
        return {"devices": devices}
    except Exception as exc:
        logger.warning("devices 查询失败：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用") from exc


def _device_label(fp: str) -> str:
    if fp.startswith("hw-a-"):
        return "Android 设备"
    if fp.startswith("hw-i-"):
        return "iPhone / iPad"
    if fp.startswith("dev-"):
        return "本机 / PWA"
    if fp.startswith("fp-"):
        return "浏览器"
    return "未知设备"


@router.delete("/devices/{device_fingerprint}")
def unbind_device(device_fingerprint: str, user_code: str = Depends(_require_user_code)) -> dict:
    """解绑指定设备（无法在该设备上自动恢复此账号）。"""
    fp = (device_fingerprint or "").strip()
    if not fp or len(fp) > 128:
        raise HTTPException(status_code=400, detail="无效设备标识")
    try:
        pool = get_pool()
        with pool.connection() as conn:
            conn.execute(
                "DELETE FROM device_user_bindings WHERE user_code = %s AND device_fingerprint = %s",
                (user_code, fp),
            )
            conn.commit()
        return {"ok": True}
    except Exception as exc:
        logger.warning("unbind device 失败：%s", exc)
        raise HTTPException(status_code=503, detail="云端暂不可用") from exc
