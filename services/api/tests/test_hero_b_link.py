"""Hero B link resolver tests."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

from app.content.hero_b_link import HeroBLinkError, resolve_hero_b_href  # noqa: E402


@pytest.mark.parametrize(
    "link,expected",
    [
        ({"kind": "tab", "params": {"tab": "home"}}, "/"),
        ({"kind": "tab", "params": {"tab": "challenge"}}, "/challenge"),
        ({"kind": "reader", "params": {"book": "MAT", "chapter": 2}}, "/reader?book=MAT&chapter=2"),
        ({"kind": "challenge", "params": {}}, "/challenge"),
        ({"kind": "assistant", "params": {}}, "/assistant"),
        ({"kind": "plans", "params": {}}, "/plans"),
        ({"kind": "map", "params": {"tourId": "exodus-wilderness"}}, "/search/map/exodus-wilderness"),
        ({"kind": "timeline", "params": {"tourId": "life-of-jesus"}}, "/search/timeline/life-of-jesus"),
        ({"kind": "diagram", "params": {"diagramId": "tabernacle-layout"}}, "/search/diagrams/tabernacle-layout"),
        ({"kind": "graph", "params": {"topicId": "exodus-core"}}, "/search/graph/exodus-core"),
        ({"kind": "discover", "params": {"view": "join"}}, "/discover/join"),
        ({"kind": "discover", "params": {"view": "group", "groupId": "abc"}}, "/discover/group/abc"),
        ({"kind": "path", "params": {"path": "/wrapped"}}, "/wrapped"),
    ],
)
def test_resolve_hero_b_href_matrix(link, expected):
    assert resolve_hero_b_href(link) == expected


def test_resolve_hero_b_href_invalid_path():
    with pytest.raises(HeroBLinkError):
        resolve_hero_b_href({"kind": "path", "params": {"path": "https://evil.com"}})


def test_resolve_hero_b_href_missing_tour():
    with pytest.raises(HeroBLinkError):
        resolve_hero_b_href({"kind": "map", "params": {}})
