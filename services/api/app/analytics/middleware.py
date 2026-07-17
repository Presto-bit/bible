"""请求级 UV 中间件：响应后记一次，不阻塞主流程外的身份识别。"""
from __future__ import annotations

import asyncio

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from ..auth.user_code import pick_user_code, uuid_for_code
from .uv import record_daily_visit, should_record_uv


def _client_ip(request: Request) -> str | None:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return None


def _visitor_ids_from_request(request: Request) -> tuple[str | None, str | None, str | None]:
    code = pick_user_code(
        request.headers.get("x-user-code"),
        request.headers.get("x-user-id"),
    )
    user_id = uuid_for_code(code) if code else None
    device_id = request.headers.get("x-device-id") or request.headers.get("x-guest-id")
    # 无设备头时用 IP 兜底，避免裸请求完全漏计（前缀区分真实设备 ID）
    if not device_id and not user_id:
        ip = _client_ip(request)
        if ip:
            device_id = f"ip:{ip}"
    # user_code 缺失时由 record_daily_visit 按设备绑定回填
    return user_id, device_id, code


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
