"""全产品 UGC 文本审核单测。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.content.moderation import (  # noqa: E402
    ModerationError,
    moderate_sync_change,
    moderate_text,
)


def test_moderation_passes_clean():
    moderate_text("今天读完约翰福音，很受感动")
    moderate_text("不可杀人 — 出埃及记")
    moderate_text(None)
    moderate_text("")


def test_moderation_blocks_spam():
    with pytest.raises(ModerationError) as ei:
        moderate_text("出售代购，有意私聊")
    assert ei.value.category == "spam"


def test_moderation_blocks_harassment():
    with pytest.raises(ModerationError) as ei:
        moderate_text("你就是个傻逼")
    assert ei.value.category == "harassment"


def test_moderation_blocks_violence_phrase():
    with pytest.raises(ModerationError) as ei:
        moderate_text("我要弄死你")
    assert ei.value.category == "violence"


def test_moderation_allows_scripture_about_death():
    moderate_text("不要怕，神与我们同在")


def test_moderation_blocks_sexual():
    with pytest.raises(ModerationError) as ei:
        moderate_text("分享色情资源")
    assert ei.value.category == "sexual"


def test_moderation_allows_url_and_phone():
    moderate_text("详情见 http://example.com/path")
    moderate_text("联系我 13800138000")


def test_moderation_blocks_heresy_domain():
    with pytest.raises(ModerationError) as ei:
        moderate_text("见 https://www.godfootsteps.org/x")
    assert ei.value.category == "heresy"


def test_moderation_blocks_too_long():
    with pytest.raises(ModerationError):
        moderate_text("一" * 2001)


def test_moderate_sync_thought():
    moderate_sync_change(
        "thought",
        {"op": "update", "data": {"body": "今天蒙恩"}},
    )


def test_moderate_sync_thought_blocks():
    with pytest.raises(ModerationError):
        moderate_sync_change(
            "thought",
            {"op": "update", "data": {"body": "加微信刷单"}},
        )


def test_moderate_sync_skips_delete():
    moderate_sync_change("thought", {"op": "delete", "data": {"body": "傻逼"}})


def test_moderate_sync_note_tags():
    with pytest.raises(ModerationError):
        moderate_sync_change(
            "note",
            {"op": "update", "data": {"body": "ok", "tags": ["诈骗"]}},
        )
