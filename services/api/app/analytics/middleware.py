"""请求级 UV 中间件：响应后异步记一次，不阻塞用户。"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from ..auth.user_code import pick_user_code, uuid_for_code
from .uv import record_daily_visit, should_record_uv


def _visitor_ids_from_request(request: Request) -> tuple[str | None, str | None]:
    code = pick_user_code(
        request.headers.get("x-user-code"),
        request.headers.get("x-user-id"),
    )
    user_id = uuid_for_code(code) if code else None
    device_id = request.headers.get("x-device-id") or request.headers.get("x-guest-id")
    return user_id, device_id


class DailyUvMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if not should_record_uv(request.url.path, request.method):
            return response
        user_id, device_id = _visitor_ids_from_request(request)
        record_daily_visit(user_id=user_id, device_id=device_id)
        return response
