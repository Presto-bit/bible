"""关系边在中心人物视角下的展示称谓（与 scripts/lib/relations.py 保持同步）。"""
from __future__ import annotations

_DEFAULT_LABELS = {
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

_PARENT_CHILD_LABEL = {"父亲": "子女", "母亲": "子女"}
_SPOUSE_PEER_LABEL = {"妻子": "丈夫", "丈夫": "妻子", "配偶": "配偶"}


def peer_relation_label(rel: dict, center_id: str) -> str:
    """从中心人物视角，返回对端（peer）的关系称谓。"""
    raw = str(rel.get("label") or "").strip()
    typ = str(rel.get("type") or "").strip()
    frm = str(rel.get("from") or "").strip()
    direction = "out" if frm == center_id else "in"

    if typ == "parent":
        if direction == "in":
            return raw or _DEFAULT_LABELS["parent"]
        return _PARENT_CHILD_LABEL.get(raw, "子女")

    if typ == "spouse":
        if direction == "out":
            return raw or "配偶"
        return _SPOUSE_PEER_LABEL.get(raw, "配偶")

    if typ == "disciple":
        if direction == "in":
            return "导师" if raw in {"", "门徒"} else raw
        return raw or "门徒"

    if typ == "mentor":
        if direction == "in":
            return raw or "导师"
        return raw or _DEFAULT_LABELS["mentor"]

    return raw or _DEFAULT_LABELS.get(typ, typ)
