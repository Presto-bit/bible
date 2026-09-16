"""智谱图像生成（CogView-3-Flash 等）。"""
from __future__ import annotations

import logging

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)


class ZhipuImageError(RuntimeError):
    pass


def zhipu_image_configured() -> bool:
    return bool((get_settings().zhipu_api_key or "").strip())


def generate_image_bytes(
    prompt: str,
    *,
    size: str | None = None,
    model: str | None = None,
    timeout_sec: float = 120.0,
) -> bytes:
    """调用智谱 images/generations，下载并返回原始图片 bytes。"""
    settings = get_settings()
    api_key = (settings.zhipu_api_key or "").strip()
    if not api_key:
        raise ZhipuImageError("ZHIPU_API_KEY 未配置")

    base = (settings.zhipu_image_base_url or "").rstrip("/")
    model_name = (model or settings.zhipu_image_model or "cogview-3-flash").strip()
    image_size = (size or settings.zhipu_image_size or "864x1152").strip()

    payload: dict = {
        "model": model_name,
        "prompt": prompt,
        "size": image_size,
    }
    if settings.zhipu_image_watermark is False:
        payload["watermark"] = False

    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        with httpx.Client(timeout=timeout_sec) as client:
            resp = client.post(f"{base}/images/generations", headers=headers, json=payload)
            if resp.status_code >= 400:
                detail = resp.text[:400]
                raise ZhipuImageError(f"智谱出图失败 ({resp.status_code}): {detail}")
            body = resp.json()
            data = body.get("data") or []
            if not data or not isinstance(data[0], dict):
                raise ZhipuImageError("智谱出图响应缺少 data")
            url = (data[0].get("url") or "").strip()
            if not url:
                raise ZhipuImageError("智谱出图响应缺少 url")
            img_resp = client.get(url, timeout=60.0)
            img_resp.raise_for_status()
            raw = img_resp.content
    except ZhipuImageError:
        raise
    except Exception as e:
        logger.warning("zhipu image generation failed: %s", e)
        raise ZhipuImageError(str(e)) from e

    if len(raw) < 256:
        raise ZhipuImageError("智谱出图返回无效图片")
    return raw
