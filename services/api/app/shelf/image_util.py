"""书架内嵌图：压缩为阅读用图（约 1200px WebP）。"""
from __future__ import annotations

import hashlib
import io
from pathlib import Path

_MAX_EDGE = 1200
_JUNK_ALTS = {"豆包", "image", "图片", "img"}


def clean_image_alt(alt: str | None) -> str:
    text = (alt or "").strip()
    if not text:
        return ""
    base = text.split("(")[0].strip()
    if base in _JUNK_ALTS or text in _JUNK_ALTS:
        return ""
    if text.startswith("豆包"):
        return ""
    return text[:120]


def optimize_image_bytes(raw: bytes, *, content_type: str = "image/png") -> tuple[bytes, str, str]:
    """返回 (bytes, ext, mime)。失败则退回原图。"""
    try:
        from PIL import Image
    except ImportError:
        ext = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/gif": ".gif",
            "image/webp": ".webp",
        }.get(content_type.split(";")[0].strip().lower(), ".png")
        return raw, ext, content_type.split(";")[0].strip() or "image/png"

    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception:
        return raw, ".png", "image/png"

    if img.mode in ("P", "LA"):
        img = img.convert("RGBA")
    elif img.mode == "CMYK":
        img = img.convert("RGB")

    w, h = img.size
    longest = max(w, h)
    if longest > _MAX_EDGE:
        scale = _MAX_EDGE / float(longest)
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)

    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    out = io.BytesIO()
    if has_alpha:
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        img.save(out, format="WEBP", quality=82, method=4)
    else:
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(out, format="WEBP", quality=82, method=4)
    data = out.getvalue()
    # 压缩后更大则保留原图
    if len(data) >= len(raw) * 0.95 and longest <= _MAX_EDGE:
        ext = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/gif": ".gif",
            "image/webp": ".webp",
        }.get(content_type.split(";")[0].strip().lower(), ".png")
        return raw, ext, content_type.split(";")[0].strip() or "image/png"
    return data, ".webp", "image/webp"


def write_optimized_image(
    raw: bytes,
    *,
    dest_dir: Path,
    stem: str,
    content_type: str = "image/png",
) -> tuple[str, str]:
    """写入优化图，返回 (filename, alt_safe_empty)."""
    data, ext, _mime = optimize_image_bytes(raw, content_type=content_type)
    digest = hashlib.sha1(raw).hexdigest()[:10]
    name = f"{stem}-inline-{digest}{ext}"
    path = dest_dir / name
    if not path.is_file() or path.stat().st_size != len(data):
        path.write_bytes(data)
    return name, ""
