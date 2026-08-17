"""词典关系导入：ID 解析、手工边规范化、覆盖率。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPTS = REPO / "scripts"
sys.path.insert(0, str(SCRIPTS))

from lib.entity_ids import EntityIndex  # noqa: E402
from lib.relation_sources import candidate_errors, source_enabled  # noqa: E402
from lib.relations import coverage_stats, merge_relations, validate_relations  # noqa: E402

from app.content import loader  # noqa: E402


def test_entity_index_resolves_aliases_without_guessing():
    entities = [
        {"id": "sinai", "name": "西奈山", "type": "place", "aliases": ["Sinai"]},
        {"id": "以撒", "name": "以撒", "type": "person", "aliases": ["Isaac"]},
        {"id": "james_apostle", "name": "雅各", "type": "person", "disambiguation": "门徒"},
        {"id": "jacob_patriarch", "name": "雅各", "type": "person", "disambiguation": "列祖"},
    ]
    index = EntityIndex.from_entities(entities)
    assert index.resolve("西奈山").entity_id == "sinai"
    assert index.resolve("isaac").entity_id == "以撒"
    assert index.resolve("jacob").entity_id == "jacob_patriarch"
    hit = index.resolve("雅各")
    assert hit.status == "ambiguous"
    assert "james_apostle" in hit.candidates
    assert index.resolve("nobody").status == "missing"


def test_merge_dedupes_undirected_siblings():
    rows = [
        {
            "from": "moses",
            "to": "aaron",
            "type": "sibling",
            "label": "哥哥",
            "refs": ["EXO 4:14"],
            "source": "curated",
        },
        {
            "from": "aaron",
            "to": "moses",
            "type": "sibling",
            "label": "兄弟姊妹",
            "refs": ["EXO 4:14"],
            "source": "gnosis",
        },
    ]
    merged = merge_relations(rows)
    assert len(merged) == 1
    assert merged[0]["source"] == "curated"


def test_candidate_requires_source_id_and_refs():
    entities = {
        "abraham": {"id": "abraham", "type": "person"},
        "ur": {"id": "ur", "type": "place"},
    }
    bad = {
        "from": "abraham",
        "to": "ur",
        "type": "located_at",
        "source": "gnosis",
        "source_id": "",
        "refs": [],
    }
    errs = candidate_errors(bad, set(entities), entities)
    assert any("source_id" in e for e in errs)
    assert any("refs" in e for e in errs)
    good = {
        "from": "abraham",
        "to": "ur",
        "type": "located_at",
        "source": "gnosis",
        "source_id": "gnosis-place:abraham->ur",
        "refs": ["GEN 11:31"],
    }
    assert candidate_errors(good, set(entities), entities) == []
    assert source_enabled("gnosis") is True
    assert source_enabled("random-wiki") is False


def test_relations_file_has_no_orphans():
    entities = json.loads(
        (REPO / "data/dictionary/entities.json").read_text(encoding="utf-8")
    ).get("entities") or []
    payload = json.loads(
        (REPO / "data/dictionary/relations.json").read_text(encoding="utf-8")
    )
    relations = payload.get("relations") or []
    assert payload.get("schema") == "relations@3"
    by_id = {e["id"]: e for e in entities}
    errors = validate_relations(relations, set(by_id), entities=by_id)
    assert errors == []
    stats = coverage_stats(relations, entities)
    assert stats["person_coverage"] >= 0.4
    assert stats["top50_person_coverage"] >= 0.9
    assert all(r.get("source") for r in relations)


def test_loader_canonical_lookup_and_empty_flag():
    sinai = loader.entity_knowledge("西奈山")
    assert sinai is not None
    assert sinai["entity"]["id"] == "sinai"
    assert sinai["has_relations"] is True
    assert sinai["graph"]["edges"]

    isaac = loader.entity_knowledge("以撒")
    assert isaac is not None
    assert isaac["has_relations"] is True

    moses = loader.entity_knowledge("moses")
    assert moses is not None
    assert moses["graph"]["edges"]

    isaac_alias = loader.entity_knowledge("isaac")
    assert isaac_alias is not None
    assert isaac_alias["entity"]["id"] == "以撒"
    assert isaac_alias["has_relations"] is True


def test_core_topics_have_enough_edges():
    topics = {t["id"]: t for t in loader.graph_topics()}
    for tid in ("patriarchs", "exodus-core", "twelve-disciples", "paul-companions"):
        topic = topics[tid]
        ids = set(topic["entity_ids"])
        edges = [
            rel
            for rel in loader.entity_relations()
            if rel["from"] in ids and rel["to"] in ids
        ]
        assert len(edges) >= 5, f"{tid} has {len(edges)} edges"


def test_homonyms_do_not_cross_testaments():
    rels = loader.entity_relations()
    assert not any(
        {r["from"], r["to"]} == {"mary_mother", "judah_patriarch"} for r in rels
    )
    assert not any(
        r["from"] == "zacharias" and r["to"] == "john_apostle" for r in rels
    )
    assert not any(
        {r["from"], r["to"]} == {"joseph_son", "mary_mother"} for r in rels
    )
    assert any(
        r["from"] == "zacharias" and r["to"] == "john_baptist" for r in rels
    )
