"""本机会话令牌：HMAC 签名 + 可选吊销表。"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time

from ..config import get_settings
from ..db import get_pool

logger = logging.getLogger(__name__)

_TOKEN_PREFIX = "bs1."
_DEFAULT_TTL_SEC = 30 * 24 * 3600
_BOOTSTRAP_TTL_SEC = 15 * 60
_revocation_ready = False


def _secret() -> str:
    s = get_settings()
    secret = (s.session_token_secret or "").strip()
    if secret:
        return secret
    # 仅本地开发允许派生；生产未配密钥则拒绝签发/校验（防知悉 DB URL 伪造会话）
    if s.auth_dev_allow_user_header:
        derived = hashlib.sha256(
            f"bible-session::{s.database_url}".encode()
        ).hexdigest()
        logger.warning("SESSION_TOKEN_SECRET 未配置，开发模式使用派生密钥")
        return derived
    raise RuntimeError(
        "SESSION_TOKEN_SECRET 未配置：生产环境必须设置独立会话密钥"
    )


def ensure_session_revocation_schema(pool=None) -> None:
    global _revocation_ready
    if _revocation_ready:
        return
    try:
        p = pool or get_pool()
        with p.connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS session_revocations (
                  token_hash TEXT PRIMARY KEY,
                  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                  expires_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS session_revocations_exp_idx "
                "ON session_revocations (expires_at)"
            )
            conn.commit()
        _revocation_ready = True
    except Exception:
        logger.exception("ensure session_revocations failed")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_session_token(
    *,
    user_id: str,
    user_code: str,
    device_id: str | None = None,
    ttl_sec: int = _DEFAULT_TTL_SEC,
) -> str:
    exp = int(time.time()) + max(60, ttl_sec)
    payload = {
        "uid": user_id,
        "code": user_code,
        "did": (device_id or "").strip()[:128],
        "exp": exp,
        "iat": int(time.time()),
    }
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    body = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    sig = hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{_TOKEN_PREFIX}{body}.{sig}"


def issue_bootstrap_token(
    *,
    user_id: str,
    user_code: str,
    device_id: str | None = None,
) -> str:
    """短时令牌（设备找回后立即换正式会话）。"""
    return issue_session_token(
        user_id=user_id,
        user_code=user_code,
        device_id=device_id,
        ttl_sec=_BOOTSTRAP_TTL_SEC,
    )


def verify_session_token(token: str | None) -> dict | None:
    if not token:
        return None
    raw_tok = token.strip()
    if raw_tok.lower().startswith("bearer "):
        raw_tok = raw_tok[7:].strip()
    if not raw_tok.startswith(_TOKEN_PREFIX):
        return None
    try:
        body, sig = raw_tok[len(_TOKEN_PREFIX) :].rsplit(".", 1)
        expected = hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        pad = "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(body + pad).decode())
        if int(payload.get("exp") or 0) < int(time.time()):
            return None
        if _is_revoked(raw_tok):
            return None
        uid = str(payload.get("uid") or "").strip()
        code = str(payload.get("code") or "").strip()
        if not uid or not code:
            return None
        return {
            "user_id": uid,
            "user_code": code,
            "device_id": str(payload.get("did") or "").strip(),
        }
    except Exception:
        return None


def revoke_session_token(token: str | None) -> bool:
    if not token:
        return False
    raw_tok = token.strip()
    if raw_tok.lower().startswith("bearer "):
        raw_tok = raw_tok[7:].strip()
    if not raw_tok.startswith(_TOKEN_PREFIX):
        return False
    try:
        ensure_session_revocation_schema()
        pad_body = raw_tok[len(_TOKEN_PREFIX) :].rsplit(".", 1)[0]
        pad = "=" * (-len(pad_body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(pad_body + pad).decode())
        exp = int(payload.get("exp") or (time.time() + 3600))
        pool = get_pool()
        with pool.connection() as conn:
            conn.execute(
                """
                INSERT INTO session_revocations (token_hash, expires_at)
                VALUES (%s, to_timestamp(%s))
                ON CONFLICT (token_hash) DO NOTHING
                """,
                (_token_hash(raw_tok), exp),
            )
            conn.commit()
        return True
    except Exception:
        logger.exception("revoke_session_token failed")
        return False


def _is_revoked(token: str) -> bool:
    """True=已吊销。查库失败时 fail-closed（视为已吊销，拒绝通行）。"""
    try:
        ensure_session_revocation_schema()
        pool = get_pool()
        with pool.connection() as conn:
            row = conn.execute(
                "SELECT 1 FROM session_revocations WHERE token_hash = %s LIMIT 1",
                (_token_hash(token),),
            ).fetchone()
            return bool(row)
    except Exception:
        logger.exception("session revocation check failed; denying token")
        return True


def make_media_asset_sig(object_key: str, exp: int) -> str:
    msg = f"media:{object_key}:{exp}"
    return hmac.new(_secret().encode(), msg.encode(), hashlib.sha256).hexdigest()[:32]


def verify_media_asset_sig(object_key: str, exp: int | str | None, sig: str | None) -> bool:
    if not object_key or not exp or not sig:
        return False
    try:
        exp_i = int(exp)
    except (TypeError, ValueError):
        return False
    if exp_i < int(time.time()):
        return False
    expected = make_media_asset_sig(object_key, exp_i)
    return hmac.compare_digest(expected, (sig or "").strip())
