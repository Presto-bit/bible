"""小爱静态结构参考：年表 / 谱系 / 示意图（P2/P3，有数据才下发）。"""
from __future__ import annotations

import re

_HISTORY_Q_RE = re.compile(
    r"时间线|年代|历史|人物|生平|王朝|诸王|谱系|族谱|年表|先后|顺序|脉络",
)
_GENEALOGY_Q_RE = re.compile(r"谱系|族谱|家谱|世系")
_KINGS_Q_RE = re.compile(r"诸王|君王|王朝|南国|北国|犹大|以色列王")
_JESUS_Q_RE = re.compile(r"耶稣.*(生平|事工|受难|复活)|生平.*耶稣")
_TABERNACLE_Q_RE = re.compile(r"会幕|约柜|至圣所|圣所")

_GOSPELS = frozenset({"MAT", "MRK", "LUK", "JHN"})
_KINGS_BOOKS = frozenset({"1KI", "2KI", "1CH", "2CH"})


def _nodes_from_events(events: list[dict], *, limit: int = 6) -> list[dict]:
    out: list[dict] = []
    for ev in events[:limit]:
        out.append(
            {
                "label": (ev.get("label") or "").strip(),
                "year": (ev.get("year_display") or "").strip(),
                "note": (ev.get("note") or "").strip(),
            }
        )
    return [n for n in out if n["label"]]


def _nodes_from_beats(beats: list[dict], *, limit: int = 6) -> list[dict]:
    out: list[dict] = []
    for b in beats[:limit]:
        out.append(
            {
                "label": (b.get("label") or "").strip(),
                "year": (b.get("ref") or "").strip(),
                "note": (b.get("note") or "").strip(),
            }
        )
    return [n for n in out if n["label"]]


def _tour_by_id(tour_id: str) -> dict | None:
    from ..content.loader import timeline_tours

    for tour in timeline_tours():
        if tour.get("id") == tour_id:
            return tour
    return None


def _graph_by_id(topic_id: str) -> dict | None:
    from ..content.loader import graph_topics

    for topic in graph_topics():
        if topic.get("id") == topic_id:
            return topic
    return None


def _diagram_asset(diagram_id: str, *, label: str | None = None) -> dict | None:
    from ..content.loader import diagram_by_id

    item = diagram_by_id(diagram_id)
    if not item:
        return None
    return {
        "kind": "diagram",
        "id": diagram_id,
        "label": label or item.get("title") or diagram_id,
        "subtitle": item.get("summary"),
        "href": f"/search/diagrams/{diagram_id}",
    }


def _timeline_asset(tour_id: str, *, label: str | None = None) -> dict | None:
    tour = _tour_by_id(tour_id)
    if not tour:
        return None
    return {
        "kind": "timeline",
        "id": tour_id,
        "label": label or tour.get("title") or tour_id,
        "subtitle": tour.get("subtitle"),
        "href": f"/search/timeline/{tour_id}",
        "nodes": _nodes_from_events(tour.get("events") or []),
    }


def _graph_asset(topic_id: str, *, label: str | None = None) -> dict | None:
    topic = _graph_by_id(topic_id)
    if not topic:
        return None
    return {
        "kind": "graph",
        "id": topic_id,
        "label": label or topic.get("title") or topic_id,
        "subtitle": topic.get("subtitle"),
        "href": f"/search/graph/{topic_id}",
        "nodes": _nodes_from_beats(topic.get("beats") or []),
    }


def _ref_parts(ref_osis: str | None) -> tuple[str | None, int | None]:
    if not ref_osis:
        return None, None
    parts = ref_osis.strip().upper().split(".")
    if not parts:
        return None, None
    book = parts[0]
    chapter = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
    return book, chapter


def resolve_structure_assets(
    *,
    scene_id: str,
    ref_osis: str | None = None,
    question: str | None = None,
) -> list[dict]:
    """返回 0–2 个静态结构参考（客户端可内联 + 深链）。"""
    q = (question or "").strip()
    book, chapter = _ref_parts(ref_osis)
    assets: list[dict] = []

    def add(asset: dict | None) -> None:
        if not asset:
            return
        if any(a.get("id") == asset.get("id") and a.get("kind") == asset.get("kind") for a in assets):
            return
        assets.append(asset)

    if book == "EXO" and chapter is not None:
        if chapter >= 25 or _TABERNACLE_Q_RE.search(q):
            add(_diagram_asset("tabernacle-layout"))
        if chapter == 14:
            add(_diagram_asset("red-sea-crossing"))

    if book in _GOSPELS or _JESUS_Q_RE.search(q):
        add(_timeline_asset("life-of-jesus"))

    if book in _KINGS_BOOKS or _KINGS_Q_RE.search(q):
        add(_timeline_asset("kings-of-judah"))

    if book == "1CH" and chapter is not None and chapter <= 10:
        add(_graph_asset("patriarchs", label="先祖族谱（节选）"))
    elif _GENEALOGY_Q_RE.search(q):
        add(_graph_asset("patriarchs", label="先祖族谱（节选）"))

    if book == "EXO" and chapter is not None and 1 <= chapter <= 24:
        add(_graph_asset("exodus-core", label="出埃及核心人物"))

    if scene_id == "chat_general" and _HISTORY_Q_RE.search(q) and not assets:
        add(_timeline_asset("life-of-jesus", label="圣经历史纲要（节选）"))

    return assets[:2]


def wants_timeline_profile(
    scene_id: str,
    *,
    question: str | None = None,
    structure_assets: list[dict] | None = None,
) -> bool:
    if scene_id != "chat_general":
        return False
    if structure_assets:
        return True
    return bool(_HISTORY_Q_RE.search((question or "").strip()))
