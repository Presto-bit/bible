"""请求级 UV 中间件：响应后记一次，不阻塞主流程外的身份识别。"""
from __future__ import annotations

import asyncio

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from ..auth.local_session import verify_session_token
from ..auth.session import resolve_user_id
from ..auth.user_code import is_user_code
from .uv import record_daily_visit, should_record_uv


def _client_ip(request: Request) -> str | None:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return None


def _visitor_ids_from_request(request: Request) -> tuple[str | None, str | None, str | None]:
    # 仅信任已校验会话；裸 X-User-Code 不可伪造 UV 归属
    uid = resolve_user_id(
        authorization=request.headers.get("authorization"),
        cookie=request.headers.get("cookie"),
    )
    code = None
    local = verify_session_token(request.headers.get("authorization"))
    if local and is_user_code(local.get("user_code") or ""):
        code = local["user_code"]
    device_id = request.headers.get("x-device-id") or request.headers.get("x-guest-id")
    if not device_id and not uid:
        ip = _client_ip(request)
        if ip:
            device_id = f"ip:{ip}"
    return uid, device_id, code


class DailyUvMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if not should_record_uv(request.url.path, request.method):
            return response
        user_id, device_id, user_code = _visitor_ids_from_request(request)
        try:
            # UV 写入放线程池，避免卡死事件循环
            await asyncio.to_thread(
                lambda: record_daily_visit(
                    user_id=user_id, device_id=device_id, user_code=user_code,
                )
            )
        except Exception:
            pass
        return response
