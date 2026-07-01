"""计划生成 + 文本审核单测（不依赖 PG；planner 需经库）。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.social.moderation import ModerationError, moderate_text  # noqa: E402

_HAS_DB = Path(get_settings().bible_db_path).exists()


# ── 审核（无需经库） ──
def test_moderation_passes_clean():
    moderate_text("今天读完约翰福音，很受感动")
    moderate_text(None)
    moderate_text("")


def test_moderation_blocks_blocklist():
    with pytest.raises(ModerationError):
        moderate_text("出售代购，有意私聊")


def test_moderation_blocks_url_and_phone():
    with pytest.raises(ModerationError):
        moderate_text("详情见 http://spam.example")
    with pytest.raises(ModerationError):
        moderate_text("联系我 13800138000")


def test_moderation_blocks_too_long():
    with pytest.raises(ModerationError):
        moderate_text("一" * 1001)


# ── 计划生成（需经库） ──
@pytest.mark.skipif(not _HAS_DB, reason="缺少经库 SQLite")
def test_generate_plan_gospels_covers_all_chapters():
    from app.content.planner import generate_plan

    plan = generate_plan("gospels", 14, theme="四福音速读")
    assert plan["title"] == "四福音速读"
    assert plan["days_count"] == 14
    # 所有章节被完整覆盖且不重复
    refs = [r for d in plan["days"] for r in d["refs"]]
    assert len(refs) == plan["chapters_total"]
    assert len(set(refs)) == len(refs)


@pytest.mark.skipif(not _HAS_DB, reason="缺少经库 SQLite")
def test_generate_plan_days_capped_to_chapters():
    from app.content.planner import generate_plan

    plan = generate_plan("proverbs", 999)
    assert plan["days_count"] == plan["chapters_total"]


@pytest.mark.skipif(not _HAS_DB, reason="缺少经库 SQLite")
def test_generate_plan_unknown_scope_raises():
    from app.content.planner import generate_plan

    with pytest.raises(ValueError):
        generate_plan("nonsense", 10)
