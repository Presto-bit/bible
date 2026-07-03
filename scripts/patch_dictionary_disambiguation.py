#!/usr/bin/env python3
"""为词典词条补充消歧字段，并拆分常见同名人物。"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTITIES_PATH = ROOT / "data/dictionary/entities.json"

NT_BOOKS = {
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL",
    "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN",
    "3JN", "JUD", "REV",
}

PATCHES: dict[str, dict] = {
    "john_apostle": {
        "name": "约翰",
        "disambiguation": "耶稣所爱的门徒",
        "testament": "NT",
        "scope_books": ["MAT", "MRK", "LUK", "JHN", "ACT", "REV"],
        "aliases": [],
    },
    "john_baptist": {
        "id": "john_baptist",
        "name": "约翰",
        "disambiguation": "施洗者，耶稣的先锋",
        "testament": "NT",
        "scope_books": ["MAT", "MRK", "LUK", "JHN"],
        "aliases": ["施洗约翰"],
    },
    "joseph": {
        "id": "joseph_son",
        "name": "约瑟",
        "disambiguation": "雅各之子，在埃及为宰相",
        "testament": "OT",
        "scope_books": ["GEN", "EXO", "1CH"],
        "aliases": [],
    },
    "雅各": {
        "id": "jacob_patriarch",
        "name": "雅各",
        "disambiguation": "以撒之子，后改名以色列",
        "testament": "OT",
        "scope_books": ["GEN", "EXO", "NUM", "DEU", "1CH"],
        "aliases": [],
    },
    "mary_mother": {
        "disambiguation": "耶稣的母亲",
        "testament": "NT",
        "scope_books": ["MAT", "MRK", "LUK", "JHN", "ACT"],
        "aliases": [],
    },
    "犹大": {
        "id": "judah_iscariot",
        "name": "犹大",
        "disambiguation": "加略人，卖主的门徒",
        "testament": "NT",
        "scope_books": ["MAT", "MRK", "LUK", "JHN", "ACT"],
        "aliases": ["加略人犹大"],
    },
    "jesus": {
        "aliases": ["基督", "弥赛亚"],
    },
    "abraham": {
        "aliases": ["亚伯兰"],
    },
    "jerusalem": {
        "aliases": ["锡安"],
    },
    "paul": {
        "aliases": ["扫罗"],
        "disambiguation": "原名扫罗的使徒",
    },
    "扫罗": {
        "id": "saul_king",
        "disambiguation": "以色列首任王（非使徒保罗）",
        "testament": "OT",
        "scope_books": ["1SA", "2SA", "1CH"],
        "aliases": [],
    },
}

NEW_ENTITIES = [
    {
        "id": "judah_patriarch",
        "name": "犹大",
        "type": "person",
        "disambiguation": "雅各之子，犹大支派之祖",
        "testament": "OT",
        "scope_books": ["GEN", "NUM", "DEU", "JUD", "1CH"],
        "summary": "雅各第四子，犹大支派之祖；其后裔大卫与弥赛亚出自此族。",
        "refs": ["GEN.29:35", "GEN.49:8", "MAT.1:2"],
        "aliases": [],
    },
    {
        "id": "joseph_husband",
        "name": "约瑟",
        "type": "person",
        "disambiguation": "马利亚之夫，耶稣的养父",
        "testament": "NT",
        "scope_books": ["MAT", "LUK"],
        "summary": "大卫后裔，木匠，蒙天使指示娶马利亚并抚养耶稣。",
        "refs": ["MAT.1:20", "MAT.2:14", "LUK.2:4"],
        "aliases": [],
    },
    {
        "id": "james_apostle",
        "name": "雅各",
        "type": "person",
        "disambiguation": "西庇太之子，耶稣门徒",
        "testament": "NT",
        "scope_books": ["MAT", "MRK", "LUK", "ACT"],
        "summary": "约翰的兄弟，十二门徒之一，曾见变像山异象。",
        "refs": ["MAT.4:21", "MAT.17:1", "ACT.12:2"],
        "aliases": ["西庇太的儿子雅各"],
    },
    {
        "id": "mary_bethany",
        "name": "马利亚",
        "type": "person",
        "disambiguation": "伯大尼，马大之妹",
        "testament": "NT",
        "scope_books": ["MAT", "MRK", "LUK", "JHN"],
        "summary": "伯大尼马大之妹，坐在耶稣脚前听道，曾用香膏抹主。",
        "refs": ["LUK.10:39", "JHN.11:2", "JHN.12:3"],
        "aliases": ["伯大尼的马利亚"],
    },
]


def testament_for_books(books: list[str]) -> str | None:
    if not books:
        return None
    nt = sum(1 for b in books if b in NT_BOOKS)
    ot = len(books) - nt
    if nt and not ot:
        return "NT"
    if ot and not nt:
        return "OT"
    return "BOTH"


def main() -> None:
    data = json.loads(ENTITIES_PATH.read_text(encoding="utf-8"))
    entities: list[dict] = data.get("entities", [])
    by_id = {e["id"]: e for e in entities}

    for eid, patch in PATCHES.items():
        if eid in by_id:
            target = by_id[eid]
        else:
            continue
        if "id" in patch and patch["id"] != eid:
            target["id"] = patch["id"]
            by_id[patch["id"]] = target
        for k, v in patch.items():
            if k == "id":
                continue
            target[k] = v

    existing_ids = {e["id"] for e in entities}
    for ent in NEW_ENTITIES:
        if ent["id"] in existing_ids:
            continue
        entities.append(ent)
        existing_ids.add(ent["id"])

    for e in entities:
        refs = e.get("refs") or []
        books = []
        for r in refs:
            book = r.replace(".", " ").split()[0].upper()
            if len(book) <= 4:
                books.append(book)
        if "scope_books" not in e and books:
            e["scope_books"] = sorted(set(books))
        if "testament" not in e and e.get("scope_books"):
            t = testament_for_books(e["scope_books"])
            if t:
                e["testament"] = t
        e.setdefault("aliases", [])
        e.setdefault("disambiguation", "")

    # 移除错误别名：施洗约翰不再占用「约翰」
    for e in entities:
        if e.get("id") == "john_baptist" and e.get("name") == "施洗约翰":
            e["name"] = "约翰"
            if "施洗约翰" not in e.get("aliases", []):
                e.setdefault("aliases", []).append("施洗约翰")

    data["schema"] = "entities@2"
    data["entities"] = entities
    ENTITIES_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"patched {len(entities)} entities -> {ENTITIES_PATH}")


if __name__ == "__main__":
    main()
