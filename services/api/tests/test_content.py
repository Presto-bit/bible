"""静态内容单测（读 data/ + 经库解析；不依赖 PG）。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.content import loader  # noqa: E402

_HAS_DB = Path(get_settings().bible_db_path).exists()
_HAS_DATA = Path(get_settings().content_data_dir).joinpath("plans").exists()
pytestmark = pytest.mark.skipif(not _HAS_DATA, reason="缺少 data/ 内容")


def test_list_plans():
    plans = loader.list_plans()
    ids = {p["plan_id"] for p in plans}
    assert {"gospels_30", "new_testament_90", "bible_year_365"} <= ids
    assert any(p["type"] == "prayer" for p in plans)
    for p in plans:
        assert p["days"] > 0


def test_reading_plan_days():
    plan = loader.get_reading_plan("gospels_30")
    assert plan["type"] == "reading"
    assert plan["days"][0]["day"] == 1
    assert plan["days"][0]["book"] == "MAT"


def test_prayer_plan():
    p = loader.get_prayer_plan("prayer_acts_30")
    assert p.get("days") and p["days"][0]["day"] == 1
    assert "acts" in p["days"][0]


def test_daily_verses_loaded():
    d = loader.daily_verses()
    assert d["count"] == len(d["verses"]) == 365
    assert len(d["themes"]) > 0


@pytest.mark.skipif(not _HAS_DB, reason="缺少经库")
def test_daily_devotional_endpoint():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    r = client.get("/content/daily-devotional")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("meditation")
    assert data.get("prayer")
    assert data.get("verse", {}).get("ref")


@pytest.mark.skipif(not _HAS_DB, reason="缺少经库")
def test_resolve_ref_text():
    txt = loader.resolve_ref_text("JHN 3:16", None, None, None, None)
    assert "神爱世人" in txt


@pytest.mark.skipif(not _HAS_DB, reason="缺少经库")
def test_crossrefs_resolves_text():
    res = loader.crossrefs_for("JHN.3.16")
    assert res is not None
    assert len(res["related"]) > 0
    assert all(r["text"] for r in res["related"])


def test_dictionary_entities():
    ents = loader.dictionary_entities()
    assert any(e["name"] == "耶稣" for e in ents)
    judah = [e for e in ents if e.get("name") == "犹大"]
    assert len(judah) >= 2
    assert any(e.get("disambiguation") for e in judah)


def test_section_titles_genesis():
    marks = loader.section_titles("GEN", 1)
    assert any(m.get("title") == "创造天地万物" for m in marks)
    idx = loader.section_titles_index()
    assert len(idx) > 100


def test_illustrations_index_and_guard():
    idx = loader.illustrations_index()
    assert idx["items"]
    first = idx["items"][0]["file"]
    assert loader.illustration_path(first) is not None
    # 目录穿越防护
    assert loader.illustration_path("../../etc/passwd") is None


def test_topics_index():
    data = loader.topics_index()
    assert data.get("topics")


def test_attribution():
    att = loader.content_attribution()
    assert att.get("sources")


def test_diagrams_catalog():
    cat = loader.diagrams_catalog()
    assert cat.get("items")
    item = loader.diagram_by_id("tabernacle-layout")
    assert item is not None
    assert loader.diagram_file_path(item["file"]) is not None


def test_entity_knowledge_moses():
    data = loader.entity_knowledge("moses")
    assert data is not None
    assert data["entity"]["name"] == "摩西"
    assert data["graph"]["edges"]


def test_graph_topics():
    topics = loader.graph_topics()
    assert len(topics) >= 1
