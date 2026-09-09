"""retrieval_cache 单元测试。"""
from __future__ import annotations

from app.rag.retrieval_cache import (
    clear_retrieval_cache,
    get_retrieval,
    put_retrieval,
    retrieval_cache_key,
)


def test_retrieval_cache_roundtrip():
    clear_retrieval_cache()
    key = retrieval_cache_key(
        "请解读 约翰福音 3:16",
        book_name="约翰福音",
        book_id="JHN",
        chapter=3,
        top_k=4,
        source_types=["commentary", "commentary-zh"],
    )
    hits = [
        {
            "chunk_text": "神爱世人",
            "score": 0.9,
            "title": "注释 A",
            "embedding": [0.1, 0.2],
        }
    ]
    assert get_retrieval(key) is None
    put_retrieval(key, hits)
    cached = get_retrieval(key)
    assert cached is not None
    assert len(cached) == 1
    assert cached[0]["chunk_text"] == "神爱世人"
    assert "embedding" not in cached[0]


def test_retrieval_cache_key_stable():
    k1 = retrieval_cache_key(
        "q",
        book_name="约翰福音",
        book_id="jhn",
        chapter=3,
        top_k=4,
        source_types=["commentary-zh", "commentary"],
    )
    k2 = retrieval_cache_key(
        "q",
        book_name="约翰福音",
        book_id="JHN",
        chapter=3,
        top_k=4,
        source_types=["commentary", "commentary-zh"],
    )
    assert k1 == k2
