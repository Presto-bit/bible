"""书架 P1/P2 解析器冒烟：md / txt / 图库 / EPUB DRM 拒绝 / PDF 书签。"""
from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.shelf.docx_parse import _wrap_trailing_gallery, _enhance_prose_semantics, parse_docx_bytes  # noqa: E402
from app.shelf.epub_parse import EpubError, parse_epub_bytes  # noqa: E402
from app.shelf.md_parse import parse_markdown_bytes  # noqa: E402
from app.shelf.pdf_parse import parse_pdf_bytes  # noqa: E402
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


def test_pdf_single_section_without_bookmarks():
    data = b"%PDF-1.4\n% fake minimal pdf for shelf import"
    parsed = parse_pdf_bytes(
        data, storage_key="shelf-abcdef0123456789.pdf", title_hint="教案周刊"
    )
    assert parsed["section_count"] == 1
    assert parsed["title"] == "教案周刊"
    sec = parsed["sections"][0]
    assert sec["kind"] == "lesson"
    assert sec["title"] == "正文"
    assert sec["html"] == ""
    assert sec["primary"]["mime"] == "application/pdf"
    assert sec["primary"]["storage_key"] == "shelf-abcdef0123456789.pdf"
    assert parsed["toc"]["body"][0]["title"] == "正文"


def test_pdf_rejects_storage_key_as_visible_title():
    data = b"%PDF-1.4\n% fake minimal pdf for shelf import"
    parsed = parse_pdf_bytes(data, storage_key="shelf-abcdef0123456789.pdf", title_hint=None)
    assert parsed["title"] == "未命名"
    assert parsed["sections"][0]["title"] == "正文"
    assert not parsed["title"].startswith("shelf-")


def test_pdf_bookmarks_become_sections():
    fitz = pytest.importorskip("fitz")
    doc = fitz.open()
    for i in range(5):
        page = doc.new_page()
        page.insert_text((72, 72), f"Page {i + 1}")
    doc.set_toc(
        [
            [1, "引言", 1],
            [1, "第一章", 3],
            [1, "第二章", 5],
        ]
    )
    data = doc.tobytes()
    doc.close()

    parsed = parse_pdf_bytes(data, storage_key="bookmarked.pdf", title_hint="教案")
    assert parsed["section_count"] == 3
    titles = [s["title"] for s in parsed["sections"]]
    assert titles == ["引言", "第一章", "第二章"]
    assert parsed["sections"][0]["primary"]["page_start"] == 0
    assert parsed["sections"][0]["primary"]["page_end"] == 1
    assert parsed["sections"][1]["primary"]["page_start"] == 2
    assert parsed["sections"][1]["primary"]["page_end"] == 3
    assert parsed["sections"][2]["primary"]["page_start"] == 4
    assert parsed["sections"][2]["primary"]["page_end"] == 4
    assert all(t.get("source") == "pdf_bookmark" for t in parsed["toc"]["body"])


def test_pdf_front_matter_when_bookmark_not_on_page_one():
    fitz = pytest.importorskip("fitz")
    doc = fitz.open()
    for i in range(4):
        page = doc.new_page()
        page.insert_text((72, 72), f"Page {i + 1}")
    doc.set_toc([[1, "正文", 2]])
    data = doc.tobytes()
    doc.close()

    parsed = parse_pdf_bytes(data, storage_key="front.pdf", title_hint="书")
    assert parsed["section_count"] == 2
    assert parsed["sections"][0]["title"] == "文前"
    assert parsed["sections"][0]["primary"]["page_start"] == 0
    assert parsed["sections"][0]["primary"]["page_end"] == 0
    assert parsed["sections"][1]["title"] == "正文"
    assert parsed["sections"][1]["primary"]["page_start"] == 1


def test_docx_plain_no_heading_falls_back_to_single_section():
    """无段落样式的普通 Word：整篇落成一节，避免入库后空书。"""
    from app.shelf.docx_parse import parse_docx_bytes

    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    doc = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>写给翻开这本书的你</w:t></w:r></w:p>
    <w:p><w:r><w:t>爱情不会自然而然地长成承诺。</w:t></w:r></w:p>
  </w:body>
</w:document>"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/document.xml", doc)
    parsed = parse_docx_bytes(buf.getvalue(), book_id="b1", storage_key="plain.docx", enrich=True)
    assert parsed["section_count"] == 1
    assert parsed["sections"][0]["title"] == "正文"
    assert "承诺" in parsed["sections"][0]["html"]
    assert parsed.get("needs_toc_confirm") is True
    assert parsed["title"] == "写给翻开这本书的你"


def test_epub_drm_rejected():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("META-INF/container.xml", "<container/>")
        zf.writestr("META-INF/encryption.xml", "<encryption/>")
        zf.writestr("OEBPS/content.opf", "<package/>")
    with pytest.raises(EpubError, match="DRM"):
        parse_epub_bytes(buf.getvalue())


def test_enhance_prose_semantics_kickers_and_verse():
    sample = (
        '<div class="shelf-docx-root">'
        '<p class="shelf-body">场景</p>'
        '<p class="shelf-body">陈宇：你好吗？</p>'
        '<p class="shelf-body">（他笑了。）</p>'
        '<p class="shelf-body">一起阅读的经文</p>'
        '<p class="shelf-body">腓立比书2:3‑4；雅各书1:19</p>'
        '<p class="shelf-body">继续对话的问题</p>'
        '<p class="shelf-body">・ 问题一？</p>'
        '<p class="shelf-body">本章练习</p>'
        '<p class="shelf-body">请写下答案。</p>'
        "</div>"
    )
    out = _enhance_prose_semantics(sample)
    assert "shelf-section-kicker" in out
    assert "shelf-dialogue-speaker" in out
    assert "shelf-verse-line" in out
    assert "2:3-4" in out
    assert "\u2011" not in out
    assert out.count("shelf-dialogue-q-head") == 2
    assert "shelf-dialogue-q" in out
    assert "shelf-aside" in out
