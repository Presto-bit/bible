"""答案级缓存单测。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.answer_document import build_answer_document  # noqa: E402
from app.ai.answer_schema import SCHEMA_VERSION  # noqa: E402
from app.rag.answer_cache import (  # noqa: E402
    cache_key,
    clear_answer_cache,
    clear_answer_cache_for_ref_prefix,
    get_answer,
    put_answer,
)


def _sample_payload(*, ref: str, answer: str) -> dict:
    doc = build_answer_document(answer, [])
    return {
        "answer": answer,
        "document": doc,
        "sections": doc["sections"],
        "meta": {"ref": ref, "schema_version": SCHEMA_VERSION},
    }


def test_verse_scene_cache_key_unified():
    k_full = cache_key(ref="JHN.3.16", mode="explain", question=None, scene="verse_full")
    k_quick = cache_key(ref="JHN.3.16", mode="explain", question=None, scene="verse_quick")
    assert k_full == k_quick


def test_cache_key_includes_knowledge_base():
    k_platform = cache_key(
        ref="JHN.3.16",
        mode="explain",
        question="这里的爱是什么意思？",
        scene="chat_explain",
        knowledge_base_id="platform",
    )
    k_custom = cache_key(
        ref="JHN.3.16",
        mode="explain",
        question="这里的爱是什么意思？",
        scene="chat_explain",
        knowledge_base_id="user_kb_1",
    )
    assert k_platform != k_custom


def test_clear_answer_cache_for_ref_prefix():
    clear_answer_cache()
    k13 = cache_key(ref="JHN.13.1", mode="explain", question=None, scene="verse_full")
    k14 = cache_key(ref="JHN.14.1", mode="explain", question=None, scene="verse_full")
    put_answer(k13, _sample_payload(ref="JHN.13.1", answer="a"))
    put_answer(k14, _sample_payload(ref="JHN.14.1", answer="b"))

    removed = clear_answer_cache_for_ref_prefix("JHN.13")
    assert removed >= 1
    assert get_answer(k13) is None
    assert get_answer(k14) is not None

    clear_answer_cache()


def test_get_answer_rejects_old_schema():
    clear_answer_cache()
    k = cache_key(ref="JHN.3.16", mode="explain", question=None, scene="verse_full")
    put_answer(k, {"answer": "a", "meta": {"ref": "JHN.3.16", "schema_version": 2}})
    assert get_answer(k) is None
    clear_answer_cache()


def test_get_answer_requires_document_v3():
    clear_answer_cache()
    k = cache_key(ref="JHN.3.16", mode="explain", question=None, scene="verse_full")
    put_answer(
        k,
        {
            "answer": "### 摘要\n测试。",
            "meta": {"ref": "JHN.3.16", "schema_version": SCHEMA_VERSION},
        },
    )
    assert get_answer(k) is None
    put_answer(k, _sample_payload(ref="JHN.3.16", answer="### 摘要\n测试。"))
    hit = get_answer(k)
    assert hit is not None
    assert hit["document"]["markdown"].startswith("### 摘要")
    clear_answer_cache()
