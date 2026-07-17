"""显式 UV 心跳：客户端启动后打一次，不依赖中间件是否挂上。"""
from __future__ import annotations

from fastapi import APIRouter, Header, Request

from ..auth.user_code import pick_user_code, uuid_for_code
from ..time_cn import china_today
from .middleware import _client_ip
from .uv import record_daily_visit, uv_last_error

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/visit")
def record_visit(
    request: Request,
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
) -> dict:
    code = pick_user_code(x_user_code, x_user_id)
    user_id = uuid_for_code(code) if code else None
    device_id = (x_device_id or x_guest_id or "").strip() or None
    if not device_id and not user_id:
        ip = _client_ip(request)
        if ip:
            device_id = f"ip:{ip}"
    ok = record_daily_visit(user_id=user_id, device_id=device_id, user_code=code)
    return {
        "ok": ok,
        "day": china_today().isoformat(),
        "error": None if ok else uv_last_error(),
    }
