"""AI 封面后处理：海报风画内叠书名（CogView 不出字）。"""
from __future__ import annotations

import io

from .cover_gen import _COVER_H, _COVER_W, _load_font, _wrap_text

_INK = (25, 25, 25)
_PAPER = (250, 248, 245)
_SIDE_PAD = 24
_TOP_START_RATIO = 0.09
_MIST_HEIGHT_RATIO = 0.42


def poster_title_layout(title: str) -> tuple[int, int]:
    """返回 (字号, 最大行数)。"""
    n = len((title or "").strip())
    if n <= 8:
        return 28, 2
    if n <= 16:
        return 24, 2
    if n <= 26:
        return 21, 3
    return 18, 3


def _truncate_lines(lines: list[str], max_lines: int, draw, font) -> list[str]:
    if len(lines) <= max_lines:
        return lines
    lines = lines[:max_lines]
    last = lines[-1]
    while last and draw.textlength(last + "…", font=font) > _COVER_W - _SIDE_PAD * 2:
        last = last[:-1]
    lines[-1] = (last + "…") if last else "…"
    return lines


def overlay_poster_title_on_cover(img, title: str):
    """在 AI 插画上方叠海报风书名（顶部纸雾渐变 + 居中墨字）。"""
    from PIL import Image, ImageDraw

    t = (title or "").strip()
    if not t:
        return img.convert("RGB") if img.mode != "RGB" else img

    base = img.convert("RGBA").resize((_COVER_W, _COVER_H), Image.Resampling.LANCZOS)
    w, h = base.size

    mist = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mist_draw = ImageDraw.Draw(mist)
    grad_h = int(h * _MIST_HEIGHT_RATIO)
    for y in range(grad_h + 1):
        t_ratio = 1.0 - (y / max(grad_h, 1))
        alpha = int(175 * (t_ratio**0.82))
        mist_draw.line([(0, y), (w, y)], fill=(*_PAPER, alpha))

    composed = Image.alpha_composite(base, mist)
    draw = ImageDraw.Draw(composed)

    font_size, max_lines = poster_title_layout(t)
    font = _load_font(font_size, bold=True)
    max_text_w = w - _SIDE_PAD * 2
    lines = _truncate_lines(_wrap_text(draw, t, font, max_text_w), max_lines, draw, font)

    line_height = int(font_size * 1.38)
    y = int(h * _TOP_START_RATIO)
    for line in lines:
        tw = draw.textlength(line, font=font)
        x = (w - tw) / 2
        draw.text((x + 1, y + 1), line, fill=(0, 0, 0, 48), font=font)
        draw.text((x, y), line, fill=(*_INK, 255), font=font)
        y += line_height

    return composed.convert("RGB")


def cover_image_to_webp(img) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=82, method=4)
    return buf.getvalue()
