"""Word 教案 HTML：保留内嵌图、换行与标题结构。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.shelf.assets import is_docx_inline_image_key  # noqa: E402
from app.shelf.docx_parse import docx_bytes_to_prose_html  # noqa: E402
from app.shelf.html_normalize import normalize_section_html  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
U3_W1 = REPO / "data" / "shelf_uploads" / "cur-u3-w1.docx"
BOOK_ID = "00000000-0000-4000-8000-000000000002"


def test_inline_image_keys_are_not_lesson_attachments():
    section = {"primary": {"storage_key": "cur-u3-w1.docx"}}
    assert is_docx_inline_image_key(section, "cur-u3-w1-inline-abc123.png")
    assert not is_docx_inline_image_key(section, "cur-u3-w1-story.mp4")
    assert not is_docx_inline_image_key(section, "cur-u3-w1.docx")


@pytest.mark.skipif(not U3_W1.is_file(), reason="sample lesson docx missing")
def test_u3_w1_keeps_images_breaks_and_headings(tmp_path: Path):
    pytest.importorskip("mammoth")
    html = docx_bytes_to_prose_html(
        U3_W1.read_bytes(),
        book_id=BOOK_ID,
        storage_key="cur-u3-w1.docx",
        media_dir=tmp_path,
    )
    html = normalize_section_html(html, kind="lesson", lesson=True)
    assert "shelf-docx-root" in html
    assert html.count("<img") == 13
    assert f"/shelf/platform/{BOOK_ID}/files/cur-u3-w1-inline-" in html
    assert "二、教学目标" in html
    assert "核心经文" in html
    idx_core = html.find("核心经文")
    idx_goal = html.find("二、教学目标")
    assert idx_goal > idx_core
    between = html[idx_core:idx_goal]
    assert "</p>" in between or "</h" in between
    assert "<h2" in html
    files = list(tmp_path.glob("cur-u3-w1-inline-*"))
    assert len(files) == 13
    assert "/ />" not in html
    assert 'class="shelf-docx-img"' in html
    assert 'loading="lazy"' in html
    # 优化后多为 webp；未压缩成功时可能仍为原后缀
    assert any(f.suffix.lower() in {".webp", ".png", ".jpg", ".jpeg", ".gif"} for f in files)
