"""创世记 50 次同行内容加载冒烟测试。"""
from __future__ import annotations

from app.content import loader


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
