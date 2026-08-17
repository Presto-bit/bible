"""词典关系 schema、去重与校验。"""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

RELATION_TYPES = {
    "parent": "亲属",
    "sibling": "兄弟姊妹",
    "spouse": "配偶",
    "disciple": "门徒",
    "mentor": "属灵导师",
    "companion": "同工",
    "located_at": "相关地点",
    "event": "相关事件",
    "contains": "包含",
}

UNDIRECTED_TYPES = {"sibling", "spouse", "companion"}
PERSON_REL_TYPES = {"parent", "sibling", "spouse", "disciple", "mentor", "companion"}
SCHEMA = "relations@3"
CANDIDATE_SCHEMA = "relation_candidates@1"

DEFAULT_LABELS = {
    "parent": "父亲",
    "sibling": "兄弟姊妹",
    "spouse": "配偶",
    "disciple": "门徒",
    "mentor": "属灵导师",
    "companion": "同工",
    "located_at": "相关地点",
    "event": "相关事件",
    "contains": "包含",
}


def edge_key(rel: dict) -> str:
    a = str(rel.get("from") or "").strip()
    b = str(rel.get("to") or "").strip()
    t = str(rel.get("type") or "").strip()
    if t in UNDIRECTED_TYPES and a > b:
        a, b = b, a
    return f"{a}|{b}|{t}"


def normalize_rel(rel: dict) -> dict:
    refs = []
    seen: set[str] = set()
    for raw in rel.get("refs") or []:
        ref = _norm_ref(str(raw))
        if ref and ref not in seen:
            seen.add(ref)
            refs.append(ref)
    typ = str(rel.get("type") or "").strip()
    label = str(rel.get("label") or "").strip() or DEFAULT_LABELS.get(typ, typ)
    out = {
        "from": str(rel.get("from") or "").strip(),
        "to": str(rel.get("to") or "").strip(),
        "type": typ,
        "label": label,
        "refs": refs,
        "source": str(rel.get("source") or "curated").strip() or "curated",
        "source_id": str(rel.get("source_id") or "").strip(),
        "confidence": str(rel.get("confidence") or "high").strip() or "high",
    }
    return out


def merge_relations(rows: Iterable[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for raw in rows:
        rel = normalize_rel(raw)
        if not rel["from"] or not rel["to"] or rel["from"] == rel["to"]:
            continue
        if rel["type"] not in RELATION_TYPES:
            continue
        key = edge_key(rel)
        prev = merged.get(key)
        if prev is None:
            merged[key] = rel
            continue
        refs = list(prev["refs"])
        for r in rel["refs"]:
            if r not in refs:
                refs.append(r)
        prev["refs"] = refs[:8]
        if not prev.get("source_id") and rel.get("source_id"):
            prev["source_id"] = rel["source_id"]
        if prev.get("confidence") != "high" and rel.get("confidence") == "high":
            prev["confidence"] = "high"
        if prev.get("source") == "gnosis" and rel.get("source") == "curated":
            prev["source"] = "curated"
            prev["label"] = rel["label"] or prev["label"]
    return sorted(merged.values(), key=lambda r: (r["from"], r["type"], r["to"]))


def validate_relations(
    relations: list[dict],
    entity_ids: set[str],
    *,
    entities: dict[str, dict] | None = None,
) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for i, rel in enumerate(relations):
        rel = normalize_rel(rel)
        if rel["type"] not in RELATION_TYPES:
            errors.append(f"[{i}] unknown type {rel['type']}")
        if rel["from"] not in entity_ids:
            errors.append(f"[{i}] missing from {rel['from']}")
        if rel["to"] not in entity_ids:
            errors.append(f"[{i}] missing to {rel['to']}")
        if rel["from"] == rel["to"]:
            errors.append(f"[{i}] self-loop {rel['from']}")
        if not rel["source"]:
            errors.append(f"[{i}] missing source")
        if rel["source"] == "curated" and not rel["refs"]:
            errors.append(f"[{i}] curated missing refs")
        key = edge_key(rel)
        if key in seen:
            errors.append(f"[{i}] duplicate {key}")
        seen.add(key)
        for ref in rel["refs"]:
            if not _looks_like_ref(ref):
                errors.append(f"[{i}] bad ref {ref}")
        if entities:
            type_err = endpoint_type_error(rel, entities)
            if type_err:
                errors.append(f"[{i}] {type_err}")
    return errors


def endpoint_type_error(rel: dict, entities: dict[str, dict]) -> str | None:
    frm = entities.get(rel.get("from") or "")
    to = entities.get(rel.get("to") or "")
    if not frm or not to:
        return None
    typ = rel.get("type")
    ft, tt = frm.get("type"), to.get("type")
    if typ in PERSON_REL_TYPES:
        if ft != "person" or tt != "person":
            return f"{typ} requires person-person, got {ft}-{tt}"
        return None
    if typ == "located_at" and tt != "place":
        return f"located_at target must be place, got {tt}"
    if typ == "contains" and ft == "person" and tt == "person":
        return "contains cannot be person-person"
    return None


def _hot_person_score(entity: dict) -> tuple[int, int]:
    # 手工核心人物优先，避免 Gnosis 截断 20 条经节把并列词条顶成「高频」。
    handmade = 0 if entity.get("source") == "gnosis" else 1
    return (handmade, min(len(entity.get("refs") or []), 20))


def coverage_stats(relations: list[dict], entities: list[dict]) -> dict:
    linked: set[str] = set()
    for rel in relations:
        linked.add(rel["from"])
        linked.add(rel["to"])
    people = [e for e in entities if e.get("type") == "person"]
    people_linked = [e for e in people if e.get("id") in linked]
    freq = sorted(people, key=_hot_person_score, reverse=True)[:50]
    freq_linked = [e for e in freq if e.get("id") in linked]
    return {
        "entities": len(entities),
        "people": len(people),
        "relations": len(relations),
        "linked_entities": len(linked),
        "entity_coverage": round(len(linked) / max(1, len(entities)), 4),
        "person_coverage": round(len(people_linked) / max(1, len(people)), 4),
        "top50_person_coverage": round(len(freq_linked) / max(1, len(freq)), 4),
        "by_type": _count_types(relations),
    }


def _count_types(relations: list[dict]) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for rel in relations:
        out[str(rel.get("type") or "")] += 1
    return dict(out)


def _norm_ref(raw: str) -> str:
    s = (raw or "").strip().replace(".", " ", 1)
    s = " ".join(s.split())
    return s.upper() if s else ""


def _looks_like_ref(ref: str) -> bool:
    parts = ref.replace(":", " ").split()
    return len(parts) >= 2 and parts[0].isalnum()
