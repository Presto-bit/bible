"""参考资料标题中文展示。"""
from __future__ import annotations

from app.ai.citations import display_citation_title


def test_display_citation_title_chinese_book():
    assert display_citation_title("0041-约翰福音") == "约翰福音 · 背景注释"


def test_display_citation_title_already_labeled():
    assert display_citation_title("约翰福音背景注释") == "约翰福音背景注释"


def test_display_citation_title_fallback_book():
    assert display_citation_title("John", "约翰福音") == "约翰福音 · 背景注释"


def test_display_citation_title_empty():
    assert display_citation_title(None) == "圣经背景注释"
