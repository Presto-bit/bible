"""活动运营 MVP 基础测试。"""
from __future__ import annotations

from app.content.campaigns import TEMPLATES, _publish_checklist


def test_templates_cover_mature_mvp():
    for tid in ("blank", "multi_day", "gathering", "prayer_drive", "promo", "verse_day", "memory"):
        assert tid in TEMPLATES
        assert TEMPLATES[tid]["landing"]
    assert TEMPLATES["blank"]["landing"].get("blocks")
    assert any(b.get("type") == "text" for b in TEMPLATES["blank"]["landing"]["blocks"])
    assert TEMPLATES["multi_day"]["landing"].get("blocks")
    assert any(b.get("type") == "days" for b in TEMPLATES["multi_day"]["landing"]["blocks"])


def test_publish_checklist_requires_groups_and_name():
    errs = _publish_checklist({"name": "", "templateId": "promo", "landing": {}}, [])
    assert any("群" in e for e in errs)
    assert any("名称" in e for e in errs)


def test_multi_day_requires_day_body():
    errs = _publish_checklist(
        {
            "name": "十日",
            "templateId": "multi_day",
            "landing": {"title": "十日", "days": [{"day": 1, "title": "d1", "body": ""}]},
        },
        ["gid"],
    )
    assert any("日课" in e for e in errs)

    ok = _publish_checklist(
        {
            "name": "十日",
            "templateId": "multi_day",
            "landing": {"title": "十日", "days": [{"day": 1, "title": "d1", "body": "内容"}]},
        },
        ["gid"],
    )
    assert ok == []


def test_unlocked_day_cap_by_start():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from app.content.campaigns import _unlocked_day_cap

    tz = ZoneInfo("Asia/Shanghai")
    start = datetime(2026, 7, 20, 0, 0, tzinfo=tz)
    # freeze not available — just assert all mode
    assert _unlocked_day_cap(start, {"dayUnlock": "all"}, 10) == 10
    # by_start with future start => 0
    future = datetime(2099, 1, 1, 0, 0, tzinfo=tz)
    assert _unlocked_day_cap(future, {"dayUnlock": "by_start"}, 10) == 0


def test_memory_and_welcome_templates_exist():
    assert "memory" in TEMPLATES
    assert "welcome" in TEMPLATES
    assert "testify" in TEMPLATES


def test_serve_and_season_templates_exist():
    assert "serve" in TEMPLATES
    assert TEMPLATES["serve"]["landing"]["features"].get("signup") is True
    assert "season" in TEMPLATES


def test_serve_publish_requires_slots():
    errs = _publish_checklist(
        {"name": "招募", "templateId": "serve", "landing": {"title": "招募", "slots": []}},
        ["gid"],
    )
    assert any("岗位" in e for e in errs)
    ok = _publish_checklist(
        {
            "name": "招募",
            "templateId": "serve",
            "landing": {
                "title": "招募",
                "slots": [{"id": "a", "title": "诗班", "limit": 10}],
            },
        },
        ["gid"],
    )
    assert ok == []


def test_hub_template_and_checklist():
    assert "hub" in TEMPLATES
    errs = _publish_checklist(
        {
            "name": "导航",
            "templateId": "hub",
            "landing": {
                "title": "导航",
                "entries": [{"id": "e1", "title": "读经", "href": "/reader"}],
            },
        },
        ["gid"],
    )
    assert any("入口" in e for e in errs)
    ok = _publish_checklist(
        {
            "name": "导航",
            "templateId": "hub",
            "landing": {
                "title": "导航",
                "entries": [
                    {"id": "e1", "title": "读经", "href": "/reader"},
                    {"id": "e2", "title": "计划", "href": "/plans"},
                ],
            },
        },
        ["gid"],
    )
    assert ok == []

def test_platform_audience_checklist():
    errs = _publish_checklist(
        {"name": "全站", "templateId": "promo", "landing": {"title": "全站"}},
        [],
        audience_mode="all",
        is_platform_admin=False,
    )
    assert any("超管" in e for e in errs)
    ok = _publish_checklist(
        {"name": "全站", "templateId": "promo", "landing": {"title": "全站"}},
        [],
        audience_mode="all",
        is_platform_admin=True,
    )
    assert ok == []
    ok_groups = _publish_checklist(
        {"name": "群", "templateId": "promo", "landing": {"title": "群"}},
        ["gid"],
        audience_mode="groups",
        is_platform_admin=False,
    )
    assert ok_groups == []

