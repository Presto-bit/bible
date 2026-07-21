"""创世记 50 次同行内容加载冒烟测试。"""
from __future__ import annotations

from datetime import date

from app.content import loader
from app.content.devotionals import scheduled_day


def test_genesis_50_walk_session_7():
    s = loader.get_devotional_session("genesis_50_walk", 7)
    assert s is not None
    assert s["title"] == "照着神的话进入方舟"
    assert s["chapter"] == 7
    assert "7:1" in (s.get("focus_verses") or "")
    assert len(s["workbook"]["questions"]) == 2
    assert len(s["workbook"]["practices"]) == 3
    assert s["letter"]["body"]
    assert s["letter"]["prayer"]


def test_genesis_50_plan_registered():
    plans = loader.list_plans()
    assert any(p["plan_id"] == "genesis_50" and p["days"] == 50 for p in plans)


def test_list_series_meta():
    items = loader.list_devotional_series()
    assert any(i["series_id"] == "genesis_50_walk" for i in items)


def test_genesis_50_scheduled_day():
    assert scheduled_day(date(2026, 7, 15)) == 1
    assert scheduled_day(date(2026, 7, 21)) == 7
    assert scheduled_day(date(2026, 7, 22)) == 8
    assert scheduled_day(date(2026, 9, 30)) == 50


def test_genesis_50_all_sessions_are_complete():
    required = (
        "today_focus",
        "ancient_question",
        "ancient_hint",
        "passage_summary",
        "covenant_thread",
        "prayer",
    )
    for day in range(1, 51):
        session = loader.get_devotional_session("genesis_50_walk", day)
        assert session is not None
        assert session["chapter"] == day
        assert session["letter"]["body"].strip()
        assert session["letter"]["prayer"].strip()
        workbook = session["workbook"]
        assert all(workbook[field].strip() for field in required)
        assert len(workbook["questions"]) == 2
        assert all(q["prompt"].strip() and q["hint"].strip() for q in workbook["questions"])
        assert len(workbook["practices"]) == 3
