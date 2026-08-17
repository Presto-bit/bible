"""开放数据来源 allowlist、适配器接口与候选审核。

外部边默认不进入正式关系；仅 allowlist 中启用、许可证可记录的来源可产出候选。
审核通过的 source_id 写入 relation_candidates.approved.json 后，下次导入才并入正式图。
"""
from __future__ import annotations

from typing import Protocol

from lib.relations import RELATION_TYPES, endpoint_type_error, normalize_rel, validate_relations

ALLOWED_SOURCES: dict[str, dict] = {
    "curated": {
        "enabled": True,
        "license": "internal",
        "url": "",
        "attribution": "彼爱手工策划",
        "into": "official",
    },
    "gnosis": {
        "enabled": True,
        "license": "CC-BY-SA",
        "url": "https://github.com/spearssoftware/gnosis",
        "attribution": "Gnosis Biblical Knowledge Graph",
        "family_into": "official",
        "other_into": "candidate",
    },
}

# 非族谱优先补的关系类型（候选/策划）
PRIORITY_TYPES = (
    "disciple",
    "mentor",
    "companion",
    "located_at",
    "event",
    "contains",
)

APPROVED_SCHEMA = "relation_candidates.approved@1"


class RelationSourceAdapter(Protocol):
    """来源适配器：族谱可进正式图，其余只出候选。"""

    source: str

    def official_edges(self) -> list[dict]:
        ...

    def candidates(self) -> list[dict]:
        ...


def source_enabled(source: str) -> bool:
    meta = ALLOWED_SOURCES.get(str(source or "").strip())
    return bool(meta and meta.get("enabled"))


def source_meta(source: str) -> dict:
    return dict(ALLOWED_SOURCES.get(str(source or "").strip()) or {})


def candidate_errors(rel: dict, entity_ids: set[str], entities: dict[str, dict] | None = None) -> list[str]:
    """候选边必须：两端 canonical、类型白名单、来源启用、来源标识、至少一条经文。"""
    rel = normalize_rel(rel)
    errors: list[str] = []
    if rel["from"] not in entity_ids:
        errors.append(f"missing from {rel['from']}")
    if rel["to"] not in entity_ids:
        errors.append(f"missing to {rel['to']}")
    if rel["type"] not in RELATION_TYPES:
        errors.append(f"unknown type {rel['type']}")
    if not source_enabled(rel["source"]):
        errors.append(f"source not allowlisted: {rel['source']}")
    if not rel["source_id"]:
        errors.append("missing source_id")
    if not rel["refs"]:
        errors.append("missing refs")
    if entities:
        type_err = endpoint_type_error(rel, entities)
        if type_err:
            errors.append(type_err)
    return errors


def filter_candidates(rows: list[dict], entity_ids: set[str], entities: dict[str, dict]) -> list[dict]:
    out: list[dict] = []
    for raw in rows:
        rel = normalize_rel(raw)
        if not candidate_errors(rel, entity_ids, entities):
            out.append(rel)
    return out


def load_approved_ids(payload: dict | None) -> set[str]:
    if not payload:
        return set()
    ids = payload.get("source_ids") or []
    return {str(x).strip() for x in ids if str(x).strip()}


def promote_approved(
    candidates: list[dict],
    approved_ids: set[str],
    entity_ids: set[str],
    entities: dict[str, dict],
) -> list[dict]:
    if not approved_ids:
        return []
    promoted: list[dict] = []
    for raw in candidates:
        rel = normalize_rel(raw)
        if rel.get("source_id") not in approved_ids:
            continue
        if candidate_errors(rel, entity_ids, entities):
            continue
        rel["confidence"] = "high"
        promoted.append(rel)
    errors = validate_relations(promoted, entity_ids, entities=entities)
    if errors:
        raise ValueError("approved candidates failed validation: " + "; ".join(errors[:8]))
    return promoted
