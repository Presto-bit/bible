#!/usr/bin/env python3
"""词典数据一次性优化：实体合并、消歧、关系补全、摘要与 testament 修复。

用法：
  python scripts/optimize_dictionary.py
  python scripts/import_relations.py --skip-gnosis   # 或含 Gnosis 全量重导
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.bible_names_zh import zh_name
from lib.dictionary_curated import (
    BOOTSTRAP_GNOSIS_IDS,
    CURATED_RELATIONS_EXTRA,
    DISAMBIGUATION_EXTRA,
    GNOSIS_RESOLVE,
    NAME_OVERRIDE,
    SUMMARY_CURATED,
)
from lib.relations import merge_relations, validate_relations

REPO = Path(__file__).resolve().parent.parent
ENTITIES = REPO / "data" / "dictionary" / "entities.json"
CURATED = REPO / "data" / "dictionary" / "relations.curated.json"
RELATIONS = REPO / "data" / "dictionary" / "relations.json"
ALIASES = REPO / "data" / "dictionary" / "id_aliases.json"
DISAM_PATCH = REPO / "data" / "dictionary" / "disambiguation_patch.json"

NT_BOOKS = {
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL",
    "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN",
    "3JN", "JUD", "REV",
}

# 合并到 canonical id；旧实体将从 entities 移除
ENTITY_MERGE = {
    "以色列": "jacob_patriarch",
    "亚伯兰": "abraham",
}

EXTRA_ALIASES = {
    **ENTITY_MERGE,
    **GNOSIS_RESOLVE,
    "abram": "abraham",
    "israel": "jacob_patriarch",
    "Israel": "jacob_patriarch",
    "rehoboam": "罗波安",
}

ENDPOINT_REDIRECT = dict(EXTRA_ALIASES)

REJECTED_SOURCE_IDS = frozenset({
    "gnosis:canaan->amorite",
})

DISAMBIGUATION = {
    "迦南": "应许之地（非人物迦南）",
    "canaan": "含的儿子，迦南地之名由来",
    "haran": "美索不达米亚城邑（非他拉之子哈兰）",
    "haran-son-of-terah": "他拉之子，罗得之父",
    "shechem": "撒冷北方城邑",
    "shechem-son-of-hamor": "哈摩利族长，强娶底拿",
    "gilead": "约旦河东地区",
    "gilead-son-of-machir": "玛拿西后裔，基列地之名由来",
    "sheba": "南方地区/王国",
    "sheba-son-of-bichri": "便雅悯人，反对大卫",
    "aram": "闪的后裔地（叙利亚一带）",
    "aram-son-of-shem": "闪的儿子，亚兰人之祖",
    "希伯仑": "犹大山地城邑",
    "hebron-son-of-kohath": "利未人哥辖之子",
    "holy-spirit": "三一真神的灵",
    "圣灵": "三一真神的灵",
    "satan": "抵挡神的仇敌",
    "撒但": "抵挡神的仇敌",
    "james_apostle": "西庇太之子，耶稣门徒（非列祖雅各）",
    "jacob_patriarch": "以撒之子，后改名以色列",
    "joseph_son": "雅各之子，在埃及为宰相",
    "joseph_husband": "马利亚的丈夫，非雅各之子约瑟",
    "mary_bethany": "伯大尼，马大之妹",
    "mary_mother": "耶稣的母亲",
}

SUMMARY_FIXES = {
    "aaron": "摩西的哥哥，以色列首位大祭司。",
    "jesse": "伯利恒人，大卫之父。",
    "midian": "亚伯拉罕与基土拉之子；米甸人以此得名。",
    "canaan": "含的儿子，地的名称由他所出。",
    "amorite": "迦南后裔中的一支民族，常与「亚摩利人」并称。",
    "moab": "罗得与长女所生，摩押人之祖。",
    "god": "创造天地的独一真神，圣经启示与敬拜的中心。",
}

TEMPLATE_SUMMARY = re.compile(
    r"^圣经中的人物「.+」（男性|女性）。$|^圣经中记载的.+。$|^约 \d+ BC；"
)
WEAK_SUMMARY = re.compile(r"Male|Female|^\d+ BC")

NEW_ENTITIES = [
    {
        "id": "amram",
        "name": "暗兰",
        "type": "person",
        "summary": "利未人，约柜夫哥辖之子；摩西与亚伦之父。",
        "refs": ["EXO 6:20", "NUM 26:59"],
        "aliases": ["Amram"],
        "scope_books": ["EXO", "NUM"],
        "testament": "OT",
        "disambiguation": "摩西亚伦之父",
        "source": "curated",
    },
    {
        "id": "jochebed",
        "name": "约基别",
        "type": "person",
        "summary": "利未女子，暗兰之妻；摩西与亚伦之母。",
        "refs": ["EXO 6:20", "NUM 26:59"],
        "aliases": ["Jochebed"],
        "scope_books": ["EXO", "NUM"],
        "testament": "OT",
        "disambiguation": "摩西亚伦之母",
        "source": "curated",
    },
    {
        "id": "nadab-son-of-aaron",
        "name": "拿达",
        "type": "person",
        "summary": "亚伦长子，与大祭司职分同受膏（后因献凡火被击杀）。",
        "refs": ["EXO 6:23", "LEV 10:1"],
        "aliases": ["Nadab"],
        "scope_books": ["EXO", "LEV"],
        "testament": "OT",
        "disambiguation": "亚伦长子",
        "source": "curated",
    },
    {
        "id": "abihu",
        "name": "亚比户",
        "type": "person",
        "summary": "亚伦次子，与拿达同受祭司职分（后献凡火被击杀）。",
        "refs": ["EXO 6:23", "LEV 10:1"],
        "aliases": ["Abihu"],
        "scope_books": ["EXO", "LEV"],
        "testament": "OT",
        "disambiguation": "亚伦次子",
        "source": "curated",
    },
    {
        "id": "ithamar",
        "name": "以他玛",
        "type": "person",
        "summary": "亚伦幼子，会幕建造与祭司职事中的执事。",
        "refs": ["EXO 6:23", "EXO 38:21"],
        "aliases": ["Ithamar"],
        "scope_books": ["EXO"],
        "testament": "OT",
        "disambiguation": "亚伦幼子",
        "source": "curated",
    },
]

NEW_CURATED = [
    {"from": "amram", "to": "aaron", "type": "parent", "label": "父亲", "refs": ["EXO 6:20"], "source": "curated", "source_id": "curated:amram-aaron", "confidence": "high"},
    {"from": "amram", "to": "moses", "type": "parent", "label": "父亲", "refs": ["EXO 6:20"], "source": "curated", "source_id": "curated:amram-moses", "confidence": "high"},
    {"from": "jochebed", "to": "aaron", "type": "parent", "label": "母亲", "refs": ["EXO 6:20"], "source": "curated", "source_id": "curated:jochebed-aaron", "confidence": "high"},
    {"from": "jochebed", "to": "moses", "type": "parent", "label": "母亲", "refs": ["EXO 6:20"], "source": "curated", "source_id": "curated:jochebed-moses", "confidence": "high"},
    {"from": "aaron", "to": "nadab-son-of-aaron", "type": "parent", "label": "父亲", "refs": ["EXO 6:23"], "source": "curated", "source_id": "curated:aaron-nadab", "confidence": "high"},
    {"from": "aaron", "to": "abihu", "type": "parent", "label": "父亲", "refs": ["EXO 6:23"], "source": "curated", "source_id": "curated:aaron-abihu", "confidence": "high"},
    {"from": "aaron", "to": "ithamar", "type": "parent", "label": "父亲", "refs": ["EXO 6:23"], "source": "curated", "source_id": "curated:aaron-ithamar", "confidence": "high"},
    {"from": "jesse", "to": "david", "type": "parent", "label": "父亲", "refs": ["1SA 16:1"], "source": "curated", "source_id": "curated:jesse-david", "confidence": "high"},
    {"from": "希律", "to": "jesus", "type": "event", "label": "婴孩屠杀", "refs": ["MAT 2:16"], "source": "curated", "source_id": "curated:herod-jesus", "confidence": "high"},
    {"from": "彼拉多", "to": "jesus", "type": "event", "label": "审问受难", "refs": ["MAT 27:11"], "source": "curated", "source_id": "curated:pilate-jesus", "confidence": "high"},
    {"from": "撒该", "to": "jesus", "type": "event", "label": "接待耶稣", "refs": ["LUK 19:5"], "source": "curated", "source_id": "curated:zaccheus-jesus", "confidence": "high"},
    {"from": "哥尼流", "to": "peter", "type": "event", "label": "蒙差见彼得", "refs": ["ACT 10:1"], "source": "curated", "source_id": "curated:cornelius-peter", "confidence": "high"},
    {"from": "约伯", "to": "god", "type": "mentor", "label": "义人受苦与对话", "refs": ["JOB 1:1"], "source": "curated", "source_id": "curated:job-god", "confidence": "high"},
]

REMOVE_CURATED_SOURCE_IDS = frozenset({
    "curated:abram-sarai",
    "curated:israel-joseph",
})


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _book(ref: str) -> str:
    return str(ref or "").replace(".", " ").split()[0].upper()


def infer_testament(entity: dict) -> str | None:
    if entity.get("testament") in {"OT", "NT", "BOTH"}:
        return entity["testament"]
    books = {_book(r) for r in (entity.get("refs") or []) if _book(r)}
    if not books:
        return None
    nt = any(b in NT_BOOKS for b in books)
    ot = any(b not in NT_BOOKS for b in books)
    if nt and ot:
        return "BOTH"
    if nt:
        return "NT"
    return "OT"


def _gnosis_people() -> dict[str, dict]:
    for path in (
        REPO / "data" / ".cache" / "gnosis-people.json",
        REPO / "data" / "vendor" / "gnosis-people-v0.9.3.json",
    ):
        if not path.exists():
            continue
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            people = raw
        elif isinstance(raw, dict):
            if isinstance(raw.get("people"), list):
                people = raw["people"]
            else:
                people = [v for v in raw.values() if isinstance(v, dict)]
        else:
            continue
        return {str(p.get("id") or ""): p for p in people if p.get("id")}
    return {}


def _norm_gnosis_ref(raw: str) -> str:
    s = str(raw or "").strip().replace(".", " ")
    return " ".join(s.split()).upper()


def _gnosis_to_entity(person: dict) -> dict:
    eid = str(person.get("id") or "").strip()
    en_name = str(person.get("name") or eid).strip()
    name = NAME_OVERRIDE.get(eid) or zh_name(en_name) or en_name
    refs = []
    for raw in (person.get("verses") or [])[:8]:
        ref = _norm_gnosis_ref(raw)
        if ref and ref not in refs:
            refs.append(ref)
    books = sorted({r.split()[0] for r in refs if r})
    testament = None
    if books:
        nt = any(b in NT_BOOKS for b in books)
        ot = any(b not in NT_BOOKS for b in books)
        testament = "BOTH" if nt and ot else ("NT" if nt else "OT")
    dis = DISAMBIGUATION_EXTRA.get(eid) or ""
    if eid.endswith("-son-of-david"):
        dis = dis or "大卫之子"
    summary = SUMMARY_CURATED.get(eid) or f"圣经中记载的{name}。"
    aliases = [en_name] if en_name and en_name != name else []
    return {
        "id": eid,
        "name": name,
        "type": "person",
        "summary": summary,
        "refs": refs,
        "aliases": aliases,
        "scope_books": books[:8],
        "testament": testament,
        "disambiguation": dis,
        "source": "gnosis",
    }


def _merge_entity_fields(target: dict, source: dict) -> None:
    refs = list(target.get("refs") or [])
    for r in source.get("refs") or []:
        if r not in refs:
            refs.append(r)
    target["refs"] = refs[:24]
    aliases = list(target.get("aliases") or [])
    for a in [source.get("name"), *(source.get("aliases") or [])]:
        if a and a not in aliases and a != target.get("name"):
            aliases.append(a)
    target["aliases"] = aliases
    scope = list(target.get("scope_books") or [])
    for b in source.get("scope_books") or []:
        if b not in scope:
            scope.append(b)
    target["scope_books"] = scope


def optimize_entities(entities: list[dict]) -> tuple[list[dict], dict]:
    by_id = {e["id"]: e for e in entities}
    stats = {"merged": 0, "removed": 0, "added": 0, "patched": 0}

    for old_id, new_id in ENTITY_MERGE.items():
        if old_id not in by_id or new_id not in by_id:
            continue
        _merge_entity_fields(by_id[new_id], by_id[old_id])
        del by_id[old_id]
        stats["merged"] += 1
        stats["removed"] += 1

    for ent in NEW_ENTITIES:
        if ent["id"] not in by_id:
            by_id[ent["id"]] = ent
            stats["added"] += 1

    gnosis_by_id = _gnosis_people()
    for gid in BOOTSTRAP_GNOSIS_IDS:
        if gid in by_id or gid in GNOSIS_RESOLVE:
            continue
        person = gnosis_by_id.get(gid)
        if not person:
            continue
        by_id[gid] = _gnosis_to_entity(person)
        stats["added"] += 1

    for ent in by_id.values():
        eid = ent.get("id") or ""
        name = ent.get("name") or ""
        if eid in NAME_OVERRIDE:
            ent["name"] = NAME_OVERRIDE[eid]
            stats["patched"] += 1

        curated_summary = SUMMARY_CURATED.get(eid) or SUMMARY_CURATED.get(name)
        if curated_summary:
            ent["summary"] = curated_summary
            stats["patched"] += 1
        elif eid in SUMMARY_FIXES:
            ent["summary"] = SUMMARY_FIXES[eid]
            stats["patched"] += 1
        elif name in SUMMARY_FIXES:
            ent["summary"] = SUMMARY_FIXES[name]
            stats["patched"] += 1
        elif TEMPLATE_SUMMARY.match((ent.get("summary") or "").strip()) or WEAK_SUMMARY.search(
            ent.get("summary") or ""
        ):
            if ent.get("type") == "person" and eid in {"midian", "canaan", "amorite", "moab"}:
                ent["summary"] = SUMMARY_FIXES.get(eid, ent["summary"])
                stats["patched"] += 1
            elif ent.get("type") == "person":
                label = name or eid
                ent["summary"] = f"圣经中记载的{label}。"
                stats["patched"] += 1

        dis = (
            DISAMBIGUATION_EXTRA.get(eid)
            or DISAMBIGUATION.get(eid)
            or DISAMBIGUATION_EXTRA.get(name)
            or DISAMBIGUATION.get(name)
        )
        if dis and (ent.get("disambiguation") or "").strip() != dis:
            ent["disambiguation"] = dis
            stats["patched"] += 1

        t = infer_testament(ent)
        if t and not ent.get("testament"):
            ent["testament"] = t
            stats["patched"] += 1

        if eid == "jacob_patriarch":
            aliases = list(ent.get("aliases") or [])
            for a in ("以色列", "Israel", "israel"):
                if a not in aliases:
                    aliases.append(a)
            ent["aliases"] = aliases
        if eid == "abraham":
            aliases = list(ent.get("aliases") or [])
            for a in ("亚伯兰", "Abram", "abram"):
                if a not in aliases:
                    aliases.append(a)
            ent["aliases"] = aliases

    out = sorted(by_id.values(), key=lambda e: (e.get("type") or "", e.get("name") or ""))
    return out, stats


def optimize_curated(relations: list[dict]) -> list[dict]:
    kept = [
        r for r in relations
        if r.get("source_id") not in REMOVE_CURATED_SOURCE_IDS
    ]
    existing = {r.get("source_id") for r in kept}
    for r in [*NEW_CURATED, *CURATED_RELATIONS_EXTRA]:
        if r["source_id"] not in existing:
            kept.append(r)
            existing.add(r["source_id"])
    # 端点重定向
    out = []
    for r in kept:
        rel = dict(r)
        rel["from"] = ENDPOINT_REDIRECT.get(rel["from"], rel["from"])
        rel["to"] = ENDPOINT_REDIRECT.get(rel["to"], rel["to"])
        out.append(rel)
    return out


def redirect_relations(relations: list[dict]) -> list[dict]:
    out = []
    for r in relations:
        if r.get("source_id") in REJECTED_SOURCE_IDS:
            continue
        rel = dict(r)
        rel["from"] = ENDPOINT_REDIRECT.get(rel["from"], rel["from"])
        rel["to"] = ENDPOINT_REDIRECT.get(rel["to"], rel["to"])
        out.append(rel)
    return merge_relations(out)


def optimize_aliases(existing: dict) -> dict:
    merged = dict(existing)
    for k, v in EXTRA_ALIASES.items():
        merged[k] = v
    return merged


def main() -> int:
    ent_payload = _load(ENTITIES)
    entities, est = optimize_entities(list(ent_payload.get("entities") or []))
    ent_payload["entities"] = entities
    ent_payload["count"] = len(entities)
    _dump(ENTITIES, ent_payload)
    print(f"✓ entities: merged={est['merged']} removed={est['removed']} added={est['added']} patched={est['patched']}")

    cur_payload = _load(CURATED)
    curated = optimize_curated(list(cur_payload.get("relations") or []))
    cur_payload["relations"] = curated
    _dump(CURATED, cur_payload)
    print(f"✓ curated relations: {len(curated)} 条")

    alias_payload = _load(ALIASES) if ALIASES.exists() else {"schema": "entity_id_aliases@1", "aliases": {}}
    alias_payload["aliases"] = optimize_aliases(alias_payload.get("aliases") or {})
    _dump(ALIASES, alias_payload)
    print(f"✓ id_aliases: {len(alias_payload['aliases'])} 条")

    if RELATIONS.exists():
        rel_payload = _load(RELATIONS)
        relations = redirect_relations(list(rel_payload.get("relations") or []))
        by_id = {e["id"]: e for e in entities}
        errors = validate_relations(relations, set(by_id), entities=by_id)
        if errors:
            print("关系校验失败（请运行 import_relations 重导）：")
            for err in errors[:20]:
                print(f"  - {err}")
            return 1
        rel_payload["relations"] = relations
        rel_payload["count"] = len(relations)
        _dump(RELATIONS, rel_payload)
        print(f"✓ relations.json 端点重定向后 {len(relations)} 条")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
