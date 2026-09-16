"""书架封面：CogView-3-Flash 按书目内容生成。"""
from __future__ import annotations

import io
import logging
from typing import Any

from ..ai.zhipu_image import ZhipuImageError, generate_image_bytes, zhipu_image_configured
from .cover_gen import _COVER_H, _COVER_W
from .cover_overlay import cover_image_to_webp, overlay_poster_title_on_cover

logger = logging.getLogger(__name__)

_STYLE_TAIL = (
    "静穆纸感扁平插画，低饱和暖灰与赭石色调，柔和侧光，"
    "非写实电影感，非科幻。画面内绝对不要任何文字、字母、数字、标题、水印或 logo。"
)


def build_shelf_cover_prompt(book: dict[str, Any]) -> str:
    """据书名/副标题/作者/类型拼出 CogView prompt（海报风：上留白给叠字）。"""
    title = (book.get("title") or "未命名").strip()
    subtitle = (book.get("subtitle") or "").strip()
    author = (book.get("author") or "").strip()
    bt = (book.get("book_type") or "document").strip().lower()

    if bt == "collection":
        subject = (
            f"Christian reading collection themed around 「{title}」"
            + (f", {subtitle}" if subtitle else "")
            + "; curated spiritual materials, calm symbolic still life"
        )
    else:
        subject = f"quiet Christian book poster mood inspired by 「{title}」"
        if subtitle:
            subject += f", {subtitle}"
        if author:
            subject += f", by {author}"

    return (
        "Vertical portrait poster-style book cover illustration for a quiet reading app. "
        f"{subject}. "
        "Composition: symbolic scene or still life in the lower two-thirds; "
        "upper third kept calm, open, minimal detail for title overlay; "
        "no faces close-up, no text in image. "
        "Quiet sacred paper-like flat illustration, muted warm gray and ochre, soft daylight, "
        "visible paper grain, layered flat shapes, low contrast. "
        "Not photorealistic cinematic, not sci-fi, not neon. "
        f"{_STYLE_TAIL}"
    )


def fit_cover_image(raw: bytes):
    """裁切/缩放为书架标准 400×533 RGB。"""
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
    return img.resize((_COVER_W, _COVER_H), Image.Resampling.LANCZOS)


def fit_cover_webp(raw: bytes) -> bytes:
    """裁切/缩放为书架标准 400×533 WebP。"""
    return cover_image_to_webp(fit_cover_image(raw))


def render_ai_cover(book: dict[str, Any]) -> bytes | None:
    """CogView 出图 → 海报风叠书名 → WebP。"""
    if not zhipu_image_configured():
        return None
    prompt = build_shelf_cover_prompt(book)
    title = (book.get("title") or "未命名").strip()
    try:
        raw = generate_image_bytes(prompt)
        img = fit_cover_image(raw)
        img = overlay_poster_title_on_cover(img, title)
        return cover_image_to_webp(img)
    except ZhipuImageError as e:
        logger.warning("shelf ai cover failed for %s: %s", book.get("id"), e)
        return None
