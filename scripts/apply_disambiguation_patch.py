#!/usr/bin/env python3
"""将 disambiguation_patch.json 合并进 entities.json。

用法：
  python scripts/apply_disambiguation_patch.py
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ENTITIES = REPO / "data" / "dictionary" / "entities.json"
PATCH = REPO / "data" / "dictionary" / "disambiguation_patch.json"


def _matches(entity: dict, match: dict) -> bool:
    for k, v in match.items():
        if entity.get(k) != v:
            return False
    return True


def main() -> int:
    if not ENTITIES.exists() or not PATCH.exists():
        raise SystemExit("缺少 entities.json 或 disambiguation_patch.json")

    data = json.loads(ENTITIES.read_text(encoding="utf-8"))
    patch = json.loads(PATCH.read_text(encoding="utf-8"))
    entities = data.get("entities") or []
    updated = 0

    for p in patch.get("patches") or []:
        match = p.get("match") or {}
        for ent in entities:
            if not _matches(ent, match):
                continue
            if p.get("disambiguation"):
                ent["disambiguation"] = p["disambiguation"]
            for alias in p.get("aliases_add") or []:
                aliases = ent.setdefault("aliases", [])
                if alias not in aliases:
                    aliases.append(alias)
            if p.get("scope_books"):
                ent["scope_books"] = sorted(set(ent.get("scope_books") or []) | set(p["scope_books"]))
            updated += 1
            break

    data["entities"] = entities
    data["count"] = len(entities)
    ENTITIES.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ 消歧补丁：更新 {updated} 条 → {ENTITIES}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
