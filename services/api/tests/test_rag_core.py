"""RAG 核心单测（无网络/无 DB）。运行：cd services/api && python -m pytest tests/ -q"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.core import (  # noqa: E402
    balance_across_documents,
    cosine,
    hybrid_rank,
    keyword_score,
    norm_minmax,
    select_chunks_for_index,
    split_text_into_chunks,
    split_text_into_chunks_with_meta,
)


def test_split_empty():
    assert split_text_into_chunks("") == []
    assert split_text_into_chunks("   \n  ") == []


def test_split_short_single_chunk():
    chunks = split_text_into_chunks("约翰福音 3:16 神爱世人。")
    assert len(chunks) == 1


def test_split_by_markdown_headings():
    doc = "# 第一章\n经文注释甲。\n\n# 第二章\n经文注释乙。"
    chunks = split_text_into_chunks(doc)
    assert len(chunks) >= 2
    assert any("第一章" in c for c in chunks)
    assert any("第二章" in c for c in chunks)


def test_split_long_paragraph_overlaps_and_respects_max():
    body = "经" * 2500
    chunks = split_text_into_chunks(body, max_chunk_chars=900, overlap=70)
    assert len(chunks) >= 3
    assert all(len(c) <= 900 for c in chunks)


def test_split_min_chunk_floor():
    # 低于 400 的 max 会被抬到 400
    body = "字" * 1000
    chunks = split_text_into_chunks(body, max_chunk_chars=100, overlap=10)
    assert all(len(c) <= 400 for c in chunks)


def test_keyword_score_overlap():
    s_hit = keyword_score("重生 永生", "论到重生与永生的教导")
    s_miss = keyword_score("重生 永生", "完全无关的内容文字")
    assert s_hit > s_miss >= 0.0


def test_cosine():
    assert cosine([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert abs(cosine([1.0, 0.0], [0.0, 1.0])) < 1e-9
    assert cosine([], []) == 0.0
    assert cosine([1.0], [1.0, 2.0]) == 0.0  # 维度不一致


def test_norm_minmax():
    assert norm_minmax([]) == []
    assert norm_minmax([5.0, 5.0]) == [0.5, 0.5]
    out = norm_minmax([0.0, 5.0, 10.0])
    assert out[0] == 0.0 and out[-1] == 1.0


def test_hybrid_rank_keyword_only_when_no_vector():
    cands = [
        {"chunk_text": "讲述重生与永生的注释", "embedding": None, "meta": {}},
        {"chunk_text": "完全无关的菜谱步骤", "embedding": None, "meta": {}},
    ]
    ranked = hybrid_rank("重生 永生", cands, None, top_k=2)
    assert ranked[0]["chunk_text"].startswith("讲述重生")
    assert ranked[0]["score"] >= ranked[1]["score"]


def test_hybrid_rank_uses_vector():
    cands = [
        {"chunk_text": "A", "embedding": [1.0, 0.0], "meta": {}},
        {"chunk_text": "B", "embedding": [0.0, 1.0], "meta": {}},
    ]
    ranked = hybrid_rank("x", cands, [1.0, 0.0], top_k=2, vector_weight=1.0, keyword_weight=0.0)
    assert ranked[0]["chunk_text"] == "A"


def test_split_with_meta_parses_heading():
    doc = "## JHN 1:9\n第一节注释。\n\n## JHN 1:10\n第二节注释。"
    items = split_text_into_chunks_with_meta(
        doc,
        section_meta_fn=lambda h: {"chapter": 1, "chapter_id": "JHN_1"} if "JHN" in h else {},
    )
    assert len(items) >= 2
    assert all(m.get("chapter_id") == "JHN_1" for _, m in items)


def test_select_chunks_per_chapter_min():
    items = [
        (f"ch1-{i}", {"chapter_id": "JHN_1"}) for i in range(5)
    ] + [
        (f"ch2-{i}", {"chapter_id": "JHN_2"}) for i in range(5)
    ]
    picked = select_chunks_for_index(items, strategy="per_chapter", per_chapter_min=2, max_abs=4)
    ch1 = sum(1 for _, m in picked if m["chapter_id"] == "JHN_1")
    ch2 = sum(1 for _, m in picked if m["chapter_id"] == "JHN_2")
    assert ch1 >= 2 and ch2 >= 2
    assert len(picked) == 4


def test_balance_across_documents():
    ranked = [
        {"chunk_text": "a1", "score": 0.9, "meta": {"document_id": "doc-a"}, "title": "A"},
        {"chunk_text": "b1", "score": 0.85, "meta": {"document_id": "doc-b"}, "title": "B"},
        {"chunk_text": "a2", "score": 0.8, "meta": {"document_id": "doc-a"}, "title": "A"},
        {"chunk_text": "b2", "score": 0.75, "meta": {"document_id": "doc-b"}, "title": "B"},
    ]
    out = balance_across_documents(ranked, 3)
    assert len(out) == 3
    docs = [x["meta"]["document_id"] for x in out]
    assert docs[0] == "doc-a"
    assert docs[1] == "doc-b"
    assert docs.count("doc-a") == 2
