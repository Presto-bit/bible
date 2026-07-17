"""显式 UV 心跳：客户端启动后打一次，不依赖中间件是否挂上。"""
from __future__ import annotations

from fastapi import APIRouter, Header, Request

from ..auth.local_session import verify_session_token
from ..auth.session import resolve_user_id
from ..auth.user_code import is_user_code
from ..time_cn import china_today
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
