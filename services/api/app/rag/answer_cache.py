"""答案级缓存：ref + mode + question_hash → 秒回（L1 内存；可选后续 Redis）。"""
from __future__ import annotations

import hashlib
import re
import time
from threading import Lock
from typing import Any

from ..config import get_settings

_lock = Lock()
_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_MAX_ENTRIES = 256

_SELECTION_TAIL = re.compile(r"\n\n选中文本：[\s\S]*$", re.MULTILINE)
# 半屏默认「请解读：{任意书卷标签}」——标签有全称/缩写差异，统一归一
_DEFAULT_EXPLAIN = re.compile(r"^请解读[：:].+$")


def normalize_question(question: str | None) -> str:
    raw = (question or "").strip()
    # 带选区的问句不归一，避免误命中无选区预热答案
    if "「" in raw or "选中文本：" in raw:
        q = re.sub(r"\s+", " ", raw)
        return q
    q = re.sub(r"\s+", " ", raw)
    q = _SELECTION_TAIL.sub("", q).strip()
    if _DEFAULT_EXPLAIN.match(q):
        return "__default_explain__"
    return q


def normalize_ref(ref: str | None) -> str:
    return (ref or "").strip().upper().split("@")[0]


def cache_key(*, ref: str | None, mode: str | None, question: str | None, scene: str | None = None) -> str:
    mode_l = (mode or "explain").strip().lower()
    scene_l = (scene or "").strip().lower()
    # 半屏释经首答：按节缓存（问句含缩写/选区差异，不参与键）
    if mode_l == "explain" and scene_l in {"verse_full", "verse_quick"}:
        q_norm = "__verse_explain__"
    else:
        q_norm = normalize_question(question)
    raw = "|".join(
        [
            normalize_ref(ref),
            mode_l,
            scene_l,
            q_norm,
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_answer(key: str) -> dict[str, Any] | None:
    ttl = max(0, int(get_settings().rag_answer_cache_ttl))
    if ttl <= 0 or not key:
        return None
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if not hit:
            return None
        ts, payload = hit
        if now - ts >= ttl:
            _cache.pop(key, None)
            return None
        return dict(payload)


def put_answer(key: str, payload: dict[str, Any]) -> None:
    ttl = max(0, int(get_settings().rag_answer_cache_ttl))
    if ttl <= 0 or not key:
        return
    now = time.monotonic()
    with _lock:
        _cache[key] = (now, dict(payload))
        if len(_cache) > _MAX_ENTRIES:
            oldest_key = min(_cache.items(), key=lambda x: x[1][0])[0]
            _cache.pop(oldest_key, None)


def clear_answer_cache() -> None:
    with _lock:
        _cache.clear()
