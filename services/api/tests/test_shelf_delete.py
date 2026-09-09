"""书架下架权限与文件 key 收集。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.shelf.service import (  # noqa: E402
    _book_can_delete,
    _storage_keys_from_book,
)


def test_book_can_delete_owner_or_admin():
    book = {"uploaded_by": "user-a"}
    assert _book_can_delete(book, actor_user_id="user-a", is_shelf_admin=False)
    assert not _book_can_delete(book, actor_user_id="user-b", is_shelf_admin=False)
    assert _book_can_delete(book, actor_user_id=None, is_shelf_admin=True)


def test_storage_keys_from_book_collects_primary_and_attachments():
    keys = _storage_keys_from_book(
        storage_key="shelf-main.docx",
        sections=[
            {
                "primary": {"storage_key": "lesson.pdf"},
                "attachments": [{"storage_key": "pic.png"}],
            }
        ],
    )
    assert keys == {"shelf-main.docx", "lesson.pdf", "pic.png"}
