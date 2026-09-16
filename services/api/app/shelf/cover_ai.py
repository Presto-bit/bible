"""书架封面：CogView-3-Flash 按书目内容生成。"""
from __future__ import annotations

import io
import logging
from typing import Any

from ..ai.zhipu_image import ZhipuImageError, generate_image_bytes, zhipu_image_configured
from .cover_gen import _COVER_H, _COVER_W

logger = logging.getLogger(__name__)

_STYLE_TAIL = (
    "静穆纸感扁平插画，低饱和暖灰与赭石色调，柔和侧光，"
    "非写实电影感，非科幻。画面内绝对不要任何文字、字母、数字、标题、水印或 logo。"
)


def build_shelf_cover_prompt(book: dict[str, Any]) -> str:
    """据书名/副标题/作者/类型拼出 CogView prompt（对齐 PRODUCT §19.14 纸感气质）。"""
    title = (book.get("title") or "未命名").strip()
    subtitle = (book.get("subtitle") or "").strip()
    author = (book.get("author") or "").strip()
    bt = (book.get("book_type") or "document").strip().lower()

    if bt == "collection":
        subject = (
            f"Christian reading collection titled 「{title}」"
            + (f", {subtitle}" if subtitle else "")
            + "; gentle stack of papers, soft lamp light, curated spiritual materials"
        )
    else:
        subject = f"book cover mood for 「{title}」"
        if subtitle:
            subject += f", subtitle: {subtitle}"
        if author:
            subject += f", by {author}"
        subject += "; infer quiet Christian devotional or educational theme from the title"

    return (
        f"Vertical portrait book cover illustration for a quiet Christian reading shelf app. "
        f"{subject}. "
        "Composition: centered symbolic scene or still life, generous margins, 3:4 portrait. "
        "Quiet sacred paper-like flat illustration, muted warm gray and ochre, soft daylight, "
        "visible paper grain, layered flat shapes, low contrast. "
        "Not photorealistic cinematic, not sci-fi, not neon. "
        "No human faces close-up. "
        f"{_STYLE_TAIL}"
    )


def fit_cover_webp(raw: bytes) -> bytes:
    """裁切/缩放为书架标准 400×533 WebP。"""
    from PIL import Image

    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size
    target_ratio = _COVER_W / _COVER_H
    src_ratio = w / max(h, 1)
    if src_ratio > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    elif src_ratio < target_ratio:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))
    img = img.resize((_COVER_W, _COVER_H), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=82, method=4)
    return buf.getvalue()


def render_ai_cover(book: dict[str, Any]) -> bytes | None:
    """调用 CogView 生成封面 WebP；未配置密钥或失败时返回 None。"""
    if not zhipu_image_configured():
        return None
    prompt = build_shelf_cover_prompt(book)
    try:
        raw = generate_image_bytes(prompt)
        return fit_cover_webp(raw)
    except ZhipuImageError as e:
        logger.warning("shelf ai cover failed for %s: %s", book.get("id"), e)
        return None
