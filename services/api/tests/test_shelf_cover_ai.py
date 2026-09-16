"""书架 AI 封面：prompt 与跳过逻辑。"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.shelf.cover_ai import build_shelf_cover_prompt, fit_cover_webp  # noqa: E402
from app.shelf.cover_overlay import overlay_poster_title_on_cover, poster_title_layout  # noqa: E402
from app.shelf.cover_gen import (  # noqa: E402
    COVER_SOURCE_USER,
    CoverProtectedError,
    ensure_book_cover,
    generate_ai_book_cover,
    write_cover_bytes,
)


def test_build_shelf_cover_prompt_includes_title_and_no_text():
    prompt = build_shelf_cover_prompt(
        {"title": "诗篇研经", "subtitle": "第一季", "author": "张三", "book_type": "document"}
    )
    assert "诗篇研经" in prompt
    assert "第一季" in prompt
    assert "poster" in prompt.lower() or "upper third" in prompt.lower()
    assert "不要任何文字" in prompt or "no text" in prompt.lower() or "No" in prompt


def test_build_shelf_cover_prompt_collection():
    prompt = build_shelf_cover_prompt({"title": "儿童主日学", "book_type": "collection"})
    assert "儿童主日学" in prompt
    assert "collection" in prompt.lower() or "Collection" in prompt


def test_ensure_book_cover_skips_existing(tmp_path, monkeypatch):
    from app.shelf import cover_gen as cg

    monkeypatch.setattr(cg, "shelf_dir", lambda: tmp_path)
    monkeypatch.setattr(cg, "shelf_file_path", lambda key: tmp_path / Path(key).name)
    book = {"id": "book-1", "title": "测试书"}
    key = write_cover_bytes("book-1", b"fake-webp-bytes-placeholder-xx")
    book["cover_storage_key"] = key
    with patch.object(cg, "render_typographic_cover") as mock_typo:
        out = ensure_book_cover(book, persist=False)
        mock_typo.assert_not_called()
    assert out == key


def test_generate_ai_book_cover_blocks_user_source(tmp_path, monkeypatch):
    from app.shelf import cover_gen as cg

    monkeypatch.setattr(cg, "shelf_dir", lambda: tmp_path)
    book = {"id": "book-2", "title": "用户封面", "cover_source": COVER_SOURCE_USER}
    with pytest.raises(CoverProtectedError):
        generate_ai_book_cover(book, persist=False, force=True)


def test_cover_version_for_key(tmp_path, monkeypatch):
    from app.shelf import cover_gen as cg

    monkeypatch.setattr(cg, "shelf_dir", lambda: tmp_path)
    monkeypatch.setattr(cg, "shelf_file_path", lambda key: tmp_path / Path(key).name)
    key = write_cover_bytes("book-v", b"fake-webp-bytes-placeholder-xx")
    ver = cg.cover_version_for_key(key)
    assert ver is not None
    assert ver > 0


def test_poster_title_layout_scales_with_length():
    assert poster_title_layout("短书名")[0] >= poster_title_layout("这是一本名字比较长的书籍资料")[0]


def test_overlay_poster_title_preserves_size():
    from PIL import Image
    import io

    img = Image.new("RGB", (400, 533), (180, 170, 160))
    out = overlay_poster_title_on_cover(img, "恩典的安慰")
    assert out.size == (400, 533)
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    assert len(buf.getvalue()) > 500


def test_fit_cover_webp_dimensions():
    from PIL import Image
    import io

    img = Image.new("RGB", (900, 900), (200, 180, 160))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    webp = fit_cover_webp(buf.getvalue())
    assert len(webp) > 100
    out = Image.open(io.BytesIO(webp))
    assert out.size == (400, 533)
