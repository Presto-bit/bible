"""答案级缓存单测。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.answer_cache import (  # noqa: E402
    cache_key,
    clear_answer_cache,
    clear_answer_cache_for_ref_prefix,
    get_answer,
    put_answer,
)


def test_clear_answer_cache_for_ref_prefix():
    clear_answer_cache()
    k13 = cache_key(ref="JHN.13.1", mode="explain", question=None, scene="verse_full")
    k14 = cache_key(ref="JHN.14.1", mode="explain", question=None, scene="verse_full")
    put_answer(k13, {"answer": "a", "meta": {"ref": "JHN.13.1", "schema_version": 2}})
    put_answer(k14, {"answer": "b", "meta": {"ref": "JHN.14.1", "schema_version": 2}})

    removed = clear_answer_cache_for_ref_prefix("JHN.13")
    assert removed >= 1
    assert get_answer(k13) is None
    assert get_answer(k14) is not None

    clear_answer_cache()


def test_get_answer_rejects_old_schema():
    clear_answer_cache()
    k = cache_key(ref="JHN.3.16", mode="explain", question=None, scene="verse_full")
    put_answer(k, {"answer": "a", "meta": {"ref": "JHN.3.16"}})
    assert get_answer(k) is None
    clear_answer_cache()
