#!/usr/bin/env python3
"""校验词典关系：断链、类型、来源、重复边、专题引用。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.entity_ids import EntityIndex
from lib.relations import coverage_stats, validate_relations

REPO = Path(__file__).resolve().parent.parent
ENTITIES = REPO / "data" / "dictionary" / "entities.json"
RELATIONS = REPO / "data" / "dictionary" / "relations.json"
TOPICS = REPO / "data" / "knowledge" / "graph_topics.json"

CORE_TOPICS = ("patriarchs", "exodus-core", "twelve-disciples", "paul-companions")


def main() -> int:
    entities = json.loads(ENTITIES.read_text(encoding="utf-8")).get("entities") or []
    rel_payload = json.loads(RELATIONS.read_text(encoding="utf-8"))
    relations = rel_payload.get("relations") or []
    index = EntityIndex.from_entities(entities)
    errors = validate_relations(relations, set(index.by_id), entities=index.by_id)

    topics = json.loads(TOPICS.read_text(encoding="utf-8")).get("topics") or []
    topic_by_id = {t.get("id"): t for t in topics}
    for tid in CORE_TOPICS:
        topic = topic_by_id.get(tid)
        if not topic:
            errors.append(f"missing topic {tid}")
            continue
        ids = [index.require(x) or x for x in (topic.get("entity_ids") or [])]
        missing = [x for x in ids if x not in index.by_id]
        if missing:
            errors.append(f"topic {tid} missing entities: {missing}")
        linked = {
            (r["from"], r["to"])
            for r in relations
            if r["from"] in ids and r["to"] in ids
        }
        if len(linked) < 5:
            errors.append(f"topic {tid} has {len(linked)} internal edges, need >= 5")

    stats = coverage_stats(relations, entities)
    print(
        f"relations={stats['relations']} person_coverage={stats['person_coverage']:.1%} "
        f"top50={stats['top50_person_coverage']:.1%}"
    )
    if stats["person_coverage"] < 0.4:
        errors.append(f"person coverage {stats['person_coverage']:.1%} < 40%")
    if stats["top50_person_coverage"] < 0.9:
        errors.append(f"top50 coverage {stats['top50_person_coverage']:.1%} < 90%")
    if errors:
        print("FAIL")
        for err in errors[:40]:
            print(f"  - {err}")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
