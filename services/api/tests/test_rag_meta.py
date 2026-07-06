"""RAG 章级 meta 与查询缓存单测。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.query_cache import clear_query_cache, embed_query_cached  # noqa: E402
from app.rag.scripture_meta import meta_from_heading  # noqa: E402


def test_meta_from_heading_osis():
    m = meta_from_heading("JHN 1:9", None)
    assert m["book_id"] == "JHN"
    assert m["chapter"] == 1
    assert m["verse_start"] == 9
    assert m["chapter_id"] == "JHN_1"


def test_meta_from_heading_zh_with_default_book():
    m = meta_from_heading("第 3 章", "MAT")
    assert m["book_id"] == "MAT"
    assert m["chapter"] == 3
    assert m["chapter_id"] == "MAT_3"


def test_embed_query_cache(monkeypatch):
    clear_query_cache()
    calls = {"n": 0}

    class FakeProvider:
        def embed_one(self, text: str):
            calls["n"] += 1
            return [0.1, 0.2]

    monkeypatch.setattr("app.rag.query_cache.get_provider", lambda: FakeProvider())
    monkeypatch.setattr(
        "app.rag.query_cache.get_settings",
        lambda: type("S", (), {"rag_query_embed_cache_ttl": 60})(),
    )
    v1 = embed_query_cached("约翰福音 1:1")
    v2 = embed_query_cached("约翰福音 1:1")
    assert v1 == v2
    assert calls["n"] == 1
