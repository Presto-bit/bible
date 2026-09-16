"""书架封面：PDF 首屏缩略 / 排版封面 / 合集模板。"""
from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Any

from .store import read_shelf_bytes, shelf_dir, shelf_file_path

_COVER_W = 400
_COVER_H = 533  # 3:4


def cover_storage_key_for_book(book_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9\-]", "", str(book_id))[:64] or "book"
    return f"cover-{safe}.webp"


def cover_hue_from_title(title: str) -> int:
    h = 0
    for ch in title or "":
        h = (h * 31 + ord(ch)) & 0x7FFFFFFF
    return h % 360


def _load_font(size: int, bold: bool = False):
    from PIL import ImageFont

    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    ]
    for path in candidates:
        if Path(path).is_file():
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def render_typographic_cover(
    *,
    title: str,
    subtitle: str | None = None,
    book_type: str = "document",
    author: str | None = None,
) -> bytes:
    from PIL import Image, ImageDraw

    t = (title or "未命名").strip()
    hue = cover_hue_from_title(t)
    bt = (book_type or "document").strip().lower()
    if bt == "collection":
        c1 = (58, 78, 96)
        c2 = (42, 58, 72)
        badge = "合集"
    elif "pdf" in bt:
        c1 = (72, 58, 48)
        c2 = (52, 42, 36)
        badge = "PDF"
    else:
        c1 = tuple(int(x) for x in _hsl_to_rgb(hue, 38, 42))
        c2 = tuple(int(x) for x in _hsl_to_rgb((hue + 28) % 360, 32, 32))
        badge = None

    img = Image.new("RGB", (_COVER_W, _COVER_H), c1)
    draw = ImageDraw.Draw(img)
    for y in range(_COVER_H):
        t_ratio = y / max(1, _COVER_H - 1)
        r = int(c1[0] * (1 - t_ratio) + c2[0] * t_ratio)
        g = int(c1[1] * (1 - t_ratio) + c2[1] * t_ratio)
        b = int(c1[2] * (1 - t_ratio) + c2[2] * t_ratio)
        draw.line([(0, y), (_COVER_W, y)], fill=(r, g, b))

    if badge:
        draw.rounded_rectangle((18, 18, 18 + 52, 18 + 26), radius=6, fill=(255, 255, 255, 38))
        draw.text((26, 22), badge, fill=(255, 255, 255), font=_load_font(14, bold=True))

    title_font = _load_font(26, bold=True)
    sub_font = _load_font(15)
    author_font = _load_font(13)
    lines = _wrap_text(draw, t, title_font, _COVER_W - 48)
    y = 120 if badge else 100
    for line in lines[:4]:
        draw.text((24, y), line, fill=(255, 255, 255), font=title_font)
        y += 34

    sub = (subtitle or "").strip()
    if sub and y < _COVER_H - 80:
        for line in _wrap_text(draw, sub, sub_font, _COVER_W - 48)[:2]:
            draw.text((24, y), line, fill=(230, 230, 230), font=sub_font)
            y += 24

    auth = (author or "").strip()
    if auth:
        draw.text((24, _COVER_H - 44), auth[:24], fill=(210, 210, 210), font=author_font)

    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=82, method=4)
    return buf.getvalue()


def _hsl_to_rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    s /= 100.0
    l /= 100.0
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    if h < 60:
        rp, gp, bp = c, x, 0
    elif h < 120:
        rp, gp, bp = x, c, 0
    elif h < 180:
        rp, gp, bp = 0, c, x
    elif h < 240:
        rp, gp, bp = 0, x, c
    elif h < 300:
        rp, gp, bp = x, 0, c
    else:
        rp, gp, bp = c, 0, x
    return int((rp + m) * 255), int((gp + m) * 255), int((bp + m) * 255)


def _wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    if not text:
        return []
    lines: list[str] = []
    buf = ""
    for ch in text:
        trial = buf + ch
        if draw.textlength(trial, font=font) <= max_width:
            buf = trial
        else:
            if buf:
                lines.append(buf)
            buf = ch
    if buf:
        lines.append(buf)
    return lines


def render_pdf_first_page_webp(data: bytes, *, max_width: int = _COVER_W) -> bytes | None:
    try:
        import fitz  # pymupdf
    except ImportError:
        return None
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        if doc.page_count < 1:
            return None
        page = doc.load_page(0)
        zoom = max_width / max(page.rect.width, 1)
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        from PIL import Image

        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        ratio = _COVER_H / max(pix.height, 1)
        target_w = min(_COVER_W, int(pix.width * ratio))
        target_h = min(_COVER_H, int(pix.height * ratio))
        img = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (_COVER_W, _COVER_H), (248, 245, 240))
        ox = (_COVER_W - target_w) // 2
        oy = (_COVER_H - target_h) // 2
        canvas.paste(img, (ox, oy))
        buf = io.BytesIO()
        canvas.save(buf, format="WEBP", quality=82, method=4)
        return buf.getvalue()
    except Exception:
        return None


def write_cover_bytes(book_id: str, data: bytes) -> str:
    key = cover_storage_key_for_book(book_id)
    path = shelf_dir() / key
    path.write_bytes(data)
    return key


def resolve_existing_cover_key(book: dict[str, Any]) -> str | None:
    explicit = (book.get("cover_storage_key") or "").strip()
    if explicit and shelf_file_path(explicit).is_file():
        return Path(explicit).name
    bid = str(book.get("id") or "")
    if not bid:
        return None
    default = cover_storage_key_for_book(bid)
    if shelf_file_path(default).is_file():
        return default
    return None


def _primary_bytes_for_cover(book: dict[str, Any]) -> tuple[bytes | None, str | None]:
    bt = (book.get("book_type") or "document").strip().lower()
    sections = book.get("sections") or []
    if bt == "collection" and sections:
        for sec in sections:
            if not isinstance(sec, dict):
                continue
            primary = sec.get("primary") or {}
            sk = str(primary.get("storage_key") or "")
            mime = str(primary.get("mime") or "")
            if sk.lower().endswith(".pdf") or "pdf" in mime.lower():
                try:
                    return read_shelf_bytes(sk), "pdf"
                except OSError:
                    continue
        return None, None
    sk = str(book.get("storage_key") or "")
    mime = str(book.get("mime") or "")
    if not sk:
        return None, None
    try:
        return read_shelf_bytes(sk), "pdf" if sk.lower().endswith(".pdf") or "pdf" in mime.lower() else "other"
    except OSError:
        return None, None


def refresh_book_cover(book: dict[str, Any], *, force: bool = False, persist: bool = True) -> str | None:
    """强制重生成封面（合集追加 PDF 后刷新首屏缩略）。"""
    if force:
        existing = resolve_existing_cover_key(book)
        if existing:
            try:
                shelf_file_path(existing).unlink(missing_ok=True)
            except OSError:
                pass
        book["cover_storage_key"] = None
    return ensure_book_cover(book, persist=persist)


def ensure_book_cover(book: dict[str, Any], *, persist: bool = True) -> str | None:
    """生成并落盘封面；返回 storage_key。"""
    existing = resolve_existing_cover_key(book)
    if existing:
        return existing

    bid = str(book.get("id") or "")
    if not bid:
        return None

    data_bytes, kind = _primary_bytes_for_cover(book)
    cover_bytes: bytes | None = None
    if kind == "pdf" and data_bytes:
        cover_bytes = render_pdf_first_page_webp(data_bytes)

    if not cover_bytes:
        cover_bytes = render_typographic_cover(
            title=str(book.get("title") or "未命名"),
            subtitle=(book.get("subtitle") or None),
            book_type=str(book.get("book_type") or "document"),
            author=(book.get("author") or None),
        )

    key = write_cover_bytes(bid, cover_bytes)
    book["cover_storage_key"] = key
    if persist:
        _persist_cover_key(book, key)
    return key


def _persist_cover_key(book: dict[str, Any], key: str) -> None:
    bid = str(book.get("id") or "")
    if not bid:
        return
    try:
        from .file_catalog import get_file_book, load_catalog_document, save_catalog_document

        if get_file_book(bid):
            doc = load_catalog_document()
            for item in doc.get("items") or []:
                if isinstance(item, dict) and str(item.get("id")) == bid:
                    item["cover_storage_key"] = key
                    save_catalog_document(doc)
                    return
    except Exception:
        pass
    try:
        from ..db import get_pool
        from .schema import ensure_shelf_schema

        pool = get_pool()
        ensure_shelf_schema(pool)
        with pool.connection() as conn:
            conn.execute(
                "UPDATE shelf_platform_book SET cover_storage_key = %s, updated_at = now() WHERE id = %s",
                (key, bid),
            )
            conn.commit()
    except Exception:
        pass
