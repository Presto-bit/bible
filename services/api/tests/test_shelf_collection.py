"""用户合集权限与摘要。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.shelf.service import (  # noqa: E402
    _book_can_edit,
    _row_to_summary,
)


def test_book_can_edit_collection_owner_or_admin():
    book = {"book_type": "collection", "uploaded_by": "user-a"}
    assert _book_can_edit(book, actor_user_id="user-a", is_shelf_admin=False)
    assert not _book_can_edit(book, actor_user_id="user-b", is_shelf_admin=False)
    assert _book_can_edit(book, actor_user_id=None, is_shelf_admin=True)


def test_book_can_edit_not_for_single_document():
    book = {"book_type": "document", "uploaded_by": "user-a"}
    assert not _book_can_edit(book, actor_user_id="user-a", is_shelf_admin=False)


def test_sync_toc_section_title():
    from app.shelf.service import _sync_toc_section_title

    toc = {
        "body": [
            {"id": "toc-1", "section_id": "sec-a", "title": "旧名"},
        ],
    }
    _sync_toc_section_title(toc, "sec-a", "新名")
    assert toc["body"][0]["title"] == "新名"


def test_book_can_edit_document_owner():
    book = {"book_type": "document", "uploaded_by": "user-a"}
    assert _book_can_edit(book, actor_user_id="user-a", is_shelf_admin=False)


def test_row_to_summary_collection_section_count():
    row = (
        "id-1",
        "我的合集",
        "副标题",
        "",
        "application/collection+json",
        0,
        {},
        [{"id": "sec-a"}, {"id": "sec-b"}],
        "published",
        9999,
        "collection",
        "user-a",
        None,
    )
    summary = _row_to_summary(row)
    assert summary["book_type"] == "collection"
    assert summary["section_count"] == 2
