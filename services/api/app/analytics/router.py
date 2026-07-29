"""显式 UV 心跳 + 获客渠道绑定。"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth.local_session import verify_session_token
from ..auth.session import resolve_user_id
from ..auth.user_code import is_user_code
from ..db import get_pool
from ..time_cn import china_today
from .acquisition import bind_user_acquisition
from .middleware import _client_ip
from .uv import record_daily_visit, uv_last_error

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _authenticated_visit_ids(
    *,
    request: Request,
    authorization: str | None,
    x_device_id: str | None,
    x_guest_id: str | None,
) -> tuple[str | None, str | None, str | None]:
    uid = resolve_user_id(
        authorization=authorization,
        cookie=request.headers.get("cookie"),
    )
    code = None
    local = verify_session_token(authorization)
    if local and is_user_code(local.get("user_code") or ""):
        code = local["user_code"]
        if not uid:
            uid = local.get("user_id")
    device_id = (x_device_id or x_guest_id or "").strip() or None
    if not device_id and not uid:
        ip = _client_ip(request)
        if ip:
            device_id = f"ip:{ip}"
    return uid, device_id, code


def _require_session_user_code(authorization: str | None) -> str:
    local = verify_session_token(authorization)
    if local and is_user_code(local.get("user_code") or ""):
        return str(local["user_code"])
    uid = resolve_user_id(authorization=authorization)
    if not uid:
        raise HTTPException(status_code=401, detail="未认证")
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT user_code FROM accounts WHERE user_id = %s LIMIT 1",
            (uid,),
        ).fetchone()
        if row and row[0]:
            return str(row[0])
        row = conn.execute(
            "SELECT user_code FROM user_profile WHERE user_id = %s LIMIT 1",
            (uid,),
        ).fetchone()
        if row and row[0]:
            return str(row[0])
    raise HTTPException(status_code=401, detail="未认证")


@router.post("/visit")
def record_visit(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
) -> dict:
    uid, device_id, code = _authenticated_visit_ids(
        request=request,
        authorization=authorization,
        x_device_id=x_device_id,
        x_guest_id=x_guest_id,
    )
    ok = record_daily_visit(user_id=uid, device_id=device_id, user_code=code)
    return {
        "ok": ok,
        "day": china_today().isoformat(),
        "error": None if ok else uv_last_error(),
    }


class AcquisitionBody(BaseModel):
    channel_l1: str = Field(default="organic")
    channel_l2: str = Field(default="")
    channel_l3: str = Field(default="")
    raw_params: dict[str, Any] = Field(default_factory=dict)
    landing_path: str = Field(default="")
    referrer_host: str = Field(default="")
    captured_at: str | None = None


@router.post("/acquisition")
def record_acquisition(
    body: AcquisitionBody,
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
) -> dict:
    """绑定获客三级渠道（First Touch，幂等，不覆盖）。"""
    user_code = _require_session_user_code(authorization)
    device_id = (x_device_id or x_guest_id or "").strip() or None
    if not device_id:
        ip = _client_ip(request)
        if ip:
            device_id = f"ip:{ip}"
    return bind_user_acquisition(
        user_code=user_code,
        channel_l1=body.channel_l1,
        channel_l2=body.channel_l2,
        channel_l3=body.channel_l3,
        raw_params=body.raw_params,
        landing_path=body.landing_path,
        referrer_host=body.referrer_host,
        device_id=device_id,
        captured_at=body.captured_at,
    )
