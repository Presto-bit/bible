"""书架 P1/P2 解析器冒烟：md / txt / 图库 / EPUB DRM 拒绝。"""
from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.shelf.docx_parse import _wrap_trailing_gallery  # noqa: E402
from app.shelf.epub_parse import EpubError, parse_epub_bytes  # noqa: E402
from app.shelf.md_parse import parse_markdown_bytes  # noqa: E402
from app.shelf.txt_parse import parse_txt_bytes  # noqa: E402


def test_markdown_splits_on_atx_headings():
    data = b"# Hello\n\nPara one.\n\n## Sec2\n\nPara two."
    parsed = parse_markdown_bytes(data, book_id="b1", storage_key="t.md")
    assert parsed["section_count"] == 2
    assert parsed["title"] == "Hello"
    assert "shelf-docx-root" in parsed["sections"][0]["html"]
    assert "Para one" in parsed["sections"][0]["html"]


def test_txt_chapter_cuts_need_confirm():
    data = "第一章 开始\n\n这是一段话。\n\n第二章 继续\n\n另一段。".encode()
    parsed = parse_txt_bytes(data, title_hint="T")
    assert parsed["needs_toc_confirm"] is True
    assert parsed["section_count"] >= 2
    titles = [s["title"] for s in parsed["sections"]]
    assert any("第一章" in t for t in titles)


def test_trailing_gallery_wrap():
    html = (
        '<p>正文</p><p>图片：</p>'
        '<p><img class="shelf-docx-img" src="a.webp"/></p>'
        '<p><img class="shelf-docx-img" src="b.webp"/></p>'
    )
    out = _wrap_trailing_gallery(html)
    assert 'class="shelf-docx-gallery"' in out
    assert out.count("<img") == 2


def test_epub_drm_rejected():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("META-INF/container.xml", "<container/>")
        zf.writestr("META-INF/encryption.xml", "<encryption/>")
        zf.writestr("OEBPS/content.opf", "<package/>")
    with pytest.raises(EpubError, match="DRM"):
        parse_epub_bytes(buf.getvalue())
