"""经文引用解析单测（依赖 build/bible_cnv.sqlite 做卷名解析）。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.bible.refs import parse_ref  # noqa: E402
from app.config import get_settings  # noqa: E402

_HAS_DB = Path(get_settings().bible_db_path).exists()
pytestmark = pytest.mark.skipif(not _HAS_DB, reason="缺少 build/bible_cnv.sqlite")


@pytest.mark.parametrize(
    "raw,osis,chapter,vs,ve",
    [
        ("JHN.3.16", "JHN.3.16", 3, 16, None),
        ("JHN 3:16", "JHN.3.16", 3, 16, None),
        ("约翰福音3:16", "JHN.3.16", 3, 16, None),
        ("约翰福音 3:16-18", "JHN.3.16", 3, 16, 18),
        ("诗篇23", "PSA.23", 23, None, None),
        ("JHN.3", "JHN.3", 3, None, None),
        ("1JN.1.9", "1JN.1.9", 1, 9, None),
        ("约翰三书1:4", "3JN.1.4", 1, 4, None),
        ("约翰福音", "JHN", None, None, None),
    ],
)
def test_parse_ref_ok(raw, osis, chapter, vs, ve):
    r = parse_ref(raw)
    assert r is not None, raw
    assert r.osis == osis
    assert r.chapter == chapter
    assert r.verse_start == vs
    assert r.verse_end == ve


@pytest.mark.parametrize("raw", ["", "   ", "哈哈99", "不存在书5:1"])
def test_parse_ref_invalid(raw):
    assert parse_ref(raw) is None


def test_fullwidth_digits():
    r = parse_ref("约翰福音３：１６")
    assert r is not None and r.osis == "JHN.3.16"
