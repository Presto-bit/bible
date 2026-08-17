#!/usr/bin/env python3
"""导入词典关系：规范化手工边 + Gnosis 族谱，并产出开放数据候选。

用法：
  python scripts/import_relations.py
  python scripts/import_relations.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from import_entities import PEOPLE_URL, PLACES_URL, _fetch, _refs_from_osis_list
from lib.relations import (
    CANDIDATE_SCHEMA,
    SCHEMA,
    coverage_stats,
    endpoint_type_error,
    merge_relations,
    normalize_rel,
    validate_relations,
)
from lib.relation_sources import (
    ALLOWED_SOURCES,
    APPROVED_SCHEMA,
    filter_candidates,
    load_approved_ids,
    promote_approved,
    source_enabled,
)
from lib.entity_ids import CURATED_ALIASES, EntityIndex

REPO = Path(__file__).resolve().parent.parent
ENTITIES = REPO / "data" / "dictionary" / "entities.json"
CURATED = REPO / "data" / "dictionary" / "relations.curated.json"
OUT = REPO / "data" / "dictionary" / "relations.json"
CANDIDATES = REPO / "data" / "dictionary" / "relation_candidates.json"
APPROVED = REPO / "data" / "dictionary" / "relation_candidates.approved.json"
REVIEW = REPO / "data" / "dictionary" / "relation_review.json"
ALIASES_OUT = REPO / "data" / "dictionary" / "id_aliases.json"

CORE_ENTITIES = [
    {
        "id": "jacob_patriarch",
        "name": "雅各",
        "type": "person",
        "summary": "以撒之子，后改名以色列；十二支派之祖。",
        "refs": ["GEN 25:26", "GEN 32:28", "GEN 49:1"],
        "aliases": ["Israel", "以色列"],
        "scope_books": ["GEN", "EXO", "NUM", "DEU", "1CH"],
        "testament": "OT",
        "disambiguation": "以撒之子，后改名以色列",
        "source": "curated",
    },
    {
        "id": "mary_mother",
        "name": "马利亚",
        "type": "person",
        "summary": "耶稣的母亲，蒙天使报喜，将神的儿子带到世上。",
        "refs": ["LUK 1:31", "MAT 1:18", "JHN 19:25"],
        "aliases": ["耶稣的母亲", "圣母马利亚"],
        "scope_books": ["MAT", "MRK", "LUK", "JHN", "ACT"],
        "testament": "NT",
        "disambiguation": "耶稣的母亲",
        "source": "curated",
    },
    {
        "id": "john_baptist",
        "name": "施洗约翰",
        "type": "person",
        "summary": "撒迦利亚与伊利莎白之子，在旷野呼喊悔改，为耶稣预备道路。",
        "refs": ["LUK 1:13", "MAT 3:1", "JHN 1:29"],
        "aliases": ["John the Baptist", "施洗者约翰"],
        "scope_books": ["MAT", "MRK", "LUK", "JHN", "ACT"],
        "testament": "NT",
        "disambiguation": "施洗约翰，非使徒约翰",
        "source": "curated",
    },
    {
        "id": "joseph_husband",
        "name": "约瑟",
        "type": "person",
        "summary": "马利亚的丈夫，大卫的子孙；天使指示他迎娶马利亚，并带耶稣逃往埃及。",
        "refs": ["MAT 1:18", "MAT 1:20", "MAT 2:13"],
        "aliases": ["马利亚的丈夫"],
        "scope_books": ["MAT", "LUK"],
        "testament": "NT",
        "disambiguation": "马利亚的丈夫，非雅各之子约瑟",
        "source": "curated",
    },
]


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ensure_core_entities(entities: list[dict]) -> tuple[list[dict], int]:
    by_id = {e.get("id"): e for e in entities}
    added = 0
    for ent in CORE_ENTITIES:
        existing = by_id.get(ent["id"])
        if existing is None:
            entities.append(ent)
            by_id[ent["id"]] = ent
            added += 1
            continue
        aliases = list(existing.get("aliases") or [])
        for alias in ent.get("aliases") or []:
            if alias not in aliases:
                aliases.append(alias)
                added += 1
        existing["aliases"] = aliases
        for key in ("testament", "disambiguation", "scope_books"):
            if not existing.get(key) and ent.get(key):
                existing[key] = ent[key]
    patches = {
        "以撒": ["Isaac", "isaac"],
        "以扫": ["Esau", "esau"],
        "sinai": ["Sinai", "西奈山", "mount-sinai"],
    }
    for eid, extra in patches.items():
        existing = by_id.get(eid)
        if not existing:
            continue
        aliases = list(existing.get("aliases") or [])
        for alias in extra:
            if alias not in aliases:
                aliases.append(alias)
                added += 1
        existing["aliases"] = aliases
    return entities, added


def _peer_token(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        return str(value.get("id") or value.get("name") or "").strip() or None
    return None


def _peer_list(value: object) -> list[str]:
    if not value:
        return []
    if isinstance(value, (str, dict)):
        token = _peer_token(value)
        return [token] if token else []
    out: list[str] = []
    for item in value:  # type: ignore[union-attr]
        token = _peer_token(item)
        if token:
            out.append(token)
    return out


def _person_list(raw: object) -> list[dict]:
    if isinstance(raw, list):
        return [p for p in raw if isinstance(p, dict)]
    if not isinstance(raw, dict):
        return []
    if isinstance(raw.get("people"), list):
        return [p for p in raw["people"] if isinstance(p, dict)]
    values = [v for v in raw.values() if isinstance(v, dict)]
    if values and any(v.get("id") or v.get("name") or v.get("father") for v in values[:8]):
        return values
    return [raw] if raw.get("id") or raw.get("name") else []


def _place_fields(person: dict) -> list[str]:
    tokens: list[str] = []
    for key in (
        "birth_place",
        "death_place",
        "place",
        "places",
        "associated_places",
        "locations",
        "lived_in",
    ):
        tokens.extend(_peer_list(person.get(key)))
    return tokens


def _refs_for(person: dict) -> list[str]:
    refs = _refs_from_osis_list(person.get("verses") or [])
    return refs[:6]


NT_BOOKS = {
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL",
    "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN",
    "3JN", "JUD", "REV",
}


def _books_of_entity(entity: dict) -> set[str]:
    books = {str(b).upper() for b in (entity.get("scope_books") or []) if b}
    for raw in entity.get("refs") or []:
        book = str(raw).replace(".", " ").split()[0].upper()
        if book:
            books.add(book)
    return books


def _books_of_person(person: dict) -> set[str]:
    books: set[str] = set()
    for raw in _refs_for(person):
        book = raw.split()[0].upper()
        if book:
            books.add(book)
    return books


def _has_cjk(s: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in (s or ""))


def _ids_compatible(token: str, entity_id: str) -> bool:
    a = token.replace("_", "-").lower()
    b = entity_id.replace("_", "-").lower()
    return a == b or a.rstrip("s") == b.rstrip("s")


def mapping_compatible(token: str, person: dict | None, entity: dict) -> bool:
    eid = str(entity.get("id") or "")
    if _ids_compatible(token, eid):
        return True
    e_books = _books_of_entity(entity)
    p_books = _books_of_person(person) if person else set()
    if p_books and e_books and p_books & e_books:
        if not _has_cjk(eid) and ("-" in eid or "_" in eid) and not _ids_compatible(token, eid):
            # 消歧义英文 id 必须和 Gnosis id 对得上，避免约翰/犹大同名串线
            return False
        return True
    e_t = entity.get("testament")
    if e_t in {"OT", "NT"} and p_books:
        p_nt = any(b in NT_BOOKS for b in p_books)
        p_ot = any(b not in NT_BOOKS for b in p_books)
        if e_t == "OT" and p_nt and not p_ot:
            return False
        if e_t == "NT" and p_ot and not p_nt:
            return False
    if p_books and e_books:
        return bool(p_books & e_books)
    return True


def _canonical_gnosis_by_name(people: list[dict]) -> dict[str, dict]:
    best: dict[str, dict] = {}
    for person in people:
        name = str(person.get("name") or "").strip().lower()
        if not name:
            continue
        score = int(person.get("verse_count") or len(person.get("verses") or []))
        prev = best.get(name)
        prev_score = int((prev or {}).get("verse_count") or len((prev or {}).get("verses") or []))
        if prev is None or score > prev_score:
            best[name] = person
    return best


def gnosis_family_edges(people: list[dict], index: EntityIndex, review: list[dict]) -> list[dict]:
    edges: list[dict] = []
    by_id = {str(p.get("id") or ""): p for p in people if p.get("id")}
    canonical_name = _canonical_gnosis_by_name(people)
    name_groups: dict[str, list[dict]] = {}
    for person in people:
        name = str(person.get("name") or "").strip().lower()
        if name:
            name_groups.setdefault(name, []).append(person)

    def resolve_or_review(token: str, context: str, *, log_missing: bool) -> str | None:
        person = by_id.get(token)
        if token in index.by_id:
            ent = index.by_id[token]
            if mapping_compatible(token, person, ent):
                return token
        hit = index.resolve(token)
        if hit.status == "ok" and hit.reason == "curated_alias":
            return hit.entity_id
        if person:
            name = str(person.get("name") or "").strip()
            if name and canonical_name.get(name.lower()) is person:
                mapped = index.resolve(name)
                ent = index.by_id.get(mapped.entity_id or "") if mapped.status == "ok" else None
                if mapped.status == "ok" and ent and mapping_compatible(token, person, ent):
                    return mapped.entity_id
            if log_missing:
                review.append({
                    "token": token,
                    "status": "missing",
                    "candidates": [],
                    "reason": "noncanonical_homonym",
                    "context": context,
                })
            return None
        group = name_groups.get(token.lower()) or []
        if len(group) == 1:
            mapped = index.resolve(group[0].get("name") or "")
            ent = index.by_id.get(mapped.entity_id or "") if mapped.status == "ok" else None
            if mapped.status == "ok" and ent and mapping_compatible(token, group[0], ent):
                return mapped.entity_id
        if len(group) > 1:
            if log_missing:
                review.append({
                    "token": token,
                    "status": "ambiguous",
                    "candidates": [str(p.get("id") or "") for p in group[:8]],
                    "reason": "gnosis_homonym",
                    "context": context,
                })
            return None
        if hit.status == "ok":
            ent = index.by_id.get(hit.entity_id or "")
            if ent and mapping_compatible(token, person, ent):
                return hit.entity_id
        if log_missing or hit.status == "ambiguous":
            review.append({
                "token": token,
                "status": hit.status,
                "candidates": list(hit.candidates),
                "reason": hit.reason,
                "context": context,
            })
        return None

    for person in people:
        src_token = _peer_token(person) or str(person.get("id") or person.get("name") or "")
        src_id = resolve_or_review(src_token, "gnosis.person", log_missing=False)
        if not src_id:
            continue
        src_ent = index.by_id[src_id]
        refs = _refs_for(person)
        gender = str(person.get("gender") or "").lower()
        parent_label = "母亲" if gender in {"female", "f"} else "父亲"

        def add_edge(frm: str, to: str, typ: str, label: str, source_id: str) -> None:
            other_id = to if frm == src_id else frm
            other = index.by_id.get(other_id)
            if not other:
                return
            ta, tb = src_ent.get("testament"), other.get("testament")
            if ta in {"OT", "NT"} and tb in {"OT", "NT"} and ta != tb:
                return
            rel = _gnosis_edge(frm, to, typ, label, refs, source_id)
            if endpoint_type_error(rel, index.by_id):
                return
            if not rel["refs"]:
                return
            edges.append(rel)

        father = _peer_token(person.get("father"))
        if father:
            fid = resolve_or_review(father, f"father of {src_token}", log_missing=True)
            if fid:
                add_edge(fid, src_id, "parent", "父亲", f"{father}->{src_token}")
        mother = _peer_token(person.get("mother"))
        if mother:
            mid = resolve_or_review(mother, f"mother of {src_token}", log_missing=True)
            if mid:
                add_edge(mid, src_id, "parent", "母亲", f"{mother}->{src_token}")

        for child in _peer_list(person.get("children")):
            cid = resolve_or_review(child, f"child of {src_token}", log_missing=True)
            if cid:
                add_edge(src_id, cid, "parent", parent_label, f"{src_token}->{child}")
        for sib in _peer_list(person.get("siblings")):
            sid = resolve_or_review(sib, f"sibling of {src_token}", log_missing=True)
            if sid:
                add_edge(src_id, sid, "sibling", "兄弟姊妹", f"{src_token}~{sib}")
        for partner in _peer_list(person.get("partners") or person.get("spouses")):
            pid = resolve_or_review(partner, f"partner of {src_token}", log_missing=True)
            if pid:
                label = "妻子" if gender in {"male", "m"} else "配偶"
                add_edge(src_id, pid, "spouse", label, f"{src_token}={partner}")
    return edges


def gnosis_place_candidates(people: list[dict], index: EntityIndex, review: list[dict]) -> list[dict]:
    out: list[dict] = []
    by_id = {str(p.get("id") or ""): p for p in people if p.get("id")}
    canonical_name = _canonical_gnosis_by_name(people)
    for person in people:
        src_token = _peer_token(person) or str(person.get("id") or "")
        src = index.resolve(src_token)
        if src.status != "ok":
            name = str(person.get("name") or "").strip()
            if name and canonical_name.get(name.lower()) is person:
                src = index.resolve(name)
        if src.status != "ok":
            continue
        refs = _refs_for(person)
        for place_token in _place_fields(person):
            hit = index.resolve(place_token)
            if hit.status != "ok":
                place_person = by_id.get(place_token)
                pname = str((place_person or {}).get("name") or "").strip()
                if pname:
                    hit = index.resolve(pname)
            if hit.status != "ok":
                if hit.status == "ambiguous":
                    review.append({
                        "token": place_token,
                        "status": hit.status,
                        "candidates": list(hit.candidates),
                        "reason": hit.reason,
                        "context": f"place of {src_token}",
                    })
                continue
            src_ent = index.by_id.get(src.entity_id or "")
            if not src_ent or src_ent.get("type") != "person":
                continue
            hit_ent = index.by_id.get(hit.entity_id or "")
            if not hit_ent or hit_ent.get("type") != "place":
                continue
            if not refs:
                continue
            out.append(normalize_rel({
                "from": src.entity_id,
                "to": hit.entity_id,
                "type": "located_at",
                "label": "相关地点",
                "refs": refs,
                "source": "gnosis",
                "source_id": f"gnosis-place:{src_token}->{place_token}",
                "confidence": "medium",
            }))
    return out


def _gnosis_edge(frm: str, to: str, typ: str, label: str, refs: list[str], source_id: str) -> dict:
    return normalize_rel({
        "from": frm,
        "to": to,
        "type": typ,
        "label": label,
        "refs": refs,
        "source": "gnosis",
        "source_id": f"gnosis:{source_id}",
        "confidence": "high",
    })


def load_curated(index: EntityIndex, review: list[dict]) -> list[dict]:
    data = _load_json(CURATED)
    out: list[dict] = []
    for raw in data.get("relations") or []:
        frm = index.resolve(str(raw.get("from") or ""))
        to = index.resolve(str(raw.get("to") or ""))
        if frm.status != "ok" or to.status != "ok":
            review.append({
                "token": f"{raw.get('from')}->{raw.get('to')}",
                "status": "missing" if frm.status != "ok" or to.status != "ok" else "ambiguous",
                "candidates": list(frm.candidates) + list(to.candidates),
                "reason": f"from={frm.status}/{frm.entity_id}; to={to.status}/{to.entity_id}",
                "context": "curated",
            })
            continue
        rel = dict(raw)
        rel["from"] = frm.entity_id
        rel["to"] = to.entity_id
        rel = normalize_rel(rel)
        type_err = endpoint_type_error(rel, index.by_id)
        if type_err:
            review.append({
                "token": f"{rel['from']}->{rel['to']}",
                "status": "rejected",
                "candidates": [],
                "reason": type_err,
                "context": "curated",
            })
            continue
        out.append(rel)
    return out


class GnosisFamilyAdapter:
    """Gnosis 族谱 → 正式关系；地点 → 候选。"""

    source = "gnosis"

    def __init__(self, people: list[dict], index: EntityIndex, review: list[dict]) -> None:
        self._people = people
        self._index = index
        self._review = review
        self._official = gnosis_family_edges(people, index, review) if source_enabled(self.source) else []
        self._candidates = gnosis_place_candidates(people, index, review) if source_enabled(self.source) else []

    def official_edges(self) -> list[dict]:
        return self._official

    def candidates(self) -> list[dict]:
        return self._candidates


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-gnosis", action="store_true")
    args = ap.parse_args()

    payload = _load_json(ENTITIES)
    entities = list(payload.get("entities") or [])
    entities, added = ensure_core_entities(entities)
    payload["entities"] = entities
    payload["count"] = len(entities)
    if added and not args.dry_run:
        _dump(ENTITIES, payload)
        print(f"✓ 补齐核心词条 {added} 条")

    index = EntityIndex.from_entities(entities)
    review: list[dict] = []
    curated = load_curated(index, review)

    gnosis_edges: list[dict] = []
    place_candidates: list[dict] = []
    if not args.skip_gnosis and source_enabled("gnosis"):
        try:
            people_raw = json.loads(_fetch(PEOPLE_URL, "gnosis-people.json").read_text(encoding="utf-8"))
            people = _person_list(people_raw)
            adapter = GnosisFamilyAdapter(people, index, review)
            gnosis_edges = adapter.official_edges()
            place_candidates = adapter.candidates()
            print(f"  Gnosis 人物 {len(people)}；族谱边 {len(gnosis_edges)}；地点候选 {len(place_candidates)}")
        except (OSError, urllib.error.URLError, json.JSONDecodeError, UnicodeError) as exc:
            print(f"⚠ Gnosis 下载/解析失败，仅使用手工边：{exc}")
            # 清掉可能截断的缓存，避免下次发版继续踩雷
            bad = REPO / "data" / ".cache" / "gnosis-people.json"
            if bad.exists():
                try:
                    bad.unlink()
                    print("  已删除损坏的 gnosis-people.json 缓存")
                except OSError:
                    pass

    entity_ids = set(index.by_id)
    candidates = filter_candidates(merge_relations(place_candidates), entity_ids, index.by_id)
    approved_payload = _load_json(APPROVED) if APPROVED.exists() else {"schema": APPROVED_SCHEMA, "source_ids": []}
    promoted = promote_approved(candidates, load_approved_ids(approved_payload), entity_ids, index.by_id)

    relations = merge_relations([*curated, *gnosis_edges, *promoted])
    errors = validate_relations(relations, entity_ids, entities=index.by_id)
    if errors:
        print("关系校验失败：")
        for err in errors[:30]:
            print(f"  - {err}")
        if len(errors) > 30:
            print(f"  … 另有 {len(errors) - 30} 条")
        return 1

    stats = coverage_stats(relations, entities)
    official_payload = {
        "schema": SCHEMA,
        "source": "curated + gnosis (CC-BY-SA)",
        "attribution": ALLOWED_SOURCES["gnosis"]["attribution"],
        "license": ALLOWED_SOURCES["gnosis"]["license"],
        "count": len(relations),
        "stats": stats,
        "relations": relations,
    }
    candidate_payload = {
        "schema": CANDIDATE_SCHEMA,
        "note": "未并入正式关系。把 source_id 写入 relation_candidates.approved.json 后重新导入才会进入 relations.json。",
        "priority_types": ["disciple", "mentor", "companion", "located_at", "event", "contains"],
        "count": len(candidates),
        "candidates": candidates,
    }
    aliases_payload = {
        "schema": "entity_id_aliases@1",
        "aliases": dict(CURATED_ALIASES),
    }
    # 去重审核记录
    uniq_review = []
    seen = set()
    for row in review:
        key = (row.get("token"), row.get("context"), row.get("status"))
        if key in seen:
            continue
        seen.add(key)
        uniq_review.append(row)
    review_payload = {
        "schema": "relation_review@1",
        "count": len(uniq_review),
        "unresolved": uniq_review,
    }

    print(
        f"✓ 关系 {stats['relations']} 条；"
        f"人物覆盖 {stats['person_coverage']:.1%}；"
        f"高频50人 {stats['top50_person_coverage']:.1%}；"
        f"审核 {len(uniq_review)} 条"
    )
    if args.dry_run:
        return 0
    _dump(OUT, official_payload)
    _dump(CANDIDATES, candidate_payload)
    _dump(REVIEW, review_payload)
    _dump(ALIASES_OUT, aliases_payload)
    if not APPROVED.exists():
        _dump(APPROVED, {
            "schema": APPROVED_SCHEMA,
            "note": "把 relation_candidates.json 中已人工核对的 source_id 填入 source_ids，再跑 import_relations.py。",
            "source_ids": [],
        })
    print(f"  写入 {OUT}")
    print(f"  候选 {CANDIDATES}")
    print(f"  审核 {REVIEW}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
