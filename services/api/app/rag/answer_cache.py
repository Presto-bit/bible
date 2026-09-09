"""答案级缓存：ref + mode + question_hash → 秒回（L1 内存；可选后续 Redis）。"""
from __future__ import annotations

import hashlib
import re
import time
from threading import Lock
from typing import Any

from ..config import get_settings

from ..ai.answer_schema import SCHEMA_VERSION

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
    """保留完整 ref（含 @ 区间），避免 MAT.4.1 与 MAT.4.1@MAT.4.25 共用缓存。"""
    return (ref or "").strip().upper()


def verse_span_from_ref(ref_raw: str | None) -> int:
    from ..bible.refs import parse_ref

    ref = parse_ref(ref_raw) if ref_raw else None
    if not ref or ref.verse_start is None:
        return 1
    return (ref.verse_end or ref.verse_start) - ref.verse_start + 1


def cache_key(
    *,
    ref: str | None,
    mode: str | None,
    question: str | None,
    scene: str | None = None,
    knowledge_base_id: str | None = None,
    verse_span: int | None = None,
) -> str:
    mode_l = (mode or "explain").strip().lower()
    scene_l = (scene or "").strip().lower()
    kb_l = (knowledge_base_id or "platform").strip().lower() or "platform"
    span_part = ""
    # 半屏释经首答：按 ref + span 缓存；verse_quick / verse_full 共享（prewarm 与半屏对齐）
    if mode_l == "explain" and scene_l in {"verse_full", "verse_quick"}:
        q_norm = "__verse_explain__"
        scene_l = "verse_explain"
        span_part = str(max(1, int(verse_span or verse_span_from_ref(ref))))
    else:
        q_norm = normalize_question(question)
    raw = "|".join(
        [
            normalize_ref(ref),
            mode_l,
            scene_l,
            q_norm,
            kb_l,
            span_part,
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cached_depth(meta: dict[str, Any]) -> str | None:
    from ..ai.output_plan import depth_kwargs_from_plan

    plan = meta.get("output_plan") or {}
    dk = depth_kwargs_from_plan(plan if isinstance(plan, dict) else None)
    depth = meta.get("depth") or dk.get("depth")
    return str(depth) if depth else None


def cache_suitable_for_request(
    payload: dict[str, Any],
    *,
    request_verse_span: int = 1,
) -> bool:
    """请求跨度大于缓存或 flash 不足覆盖大段时，拒绝命中。"""
    meta = payload.get("meta") or {}
    cached_span = int(meta.get("verse_span") or 1)
    req_span = max(1, int(request_verse_span or 1))
    if req_span > cached_span:
        return False
    depth = _cached_depth(meta)
    if depth == "flash" and req_span >= 6:
        return False
    return True


def _validate_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    meta = payload.get("meta") or {}
    schema = int(meta.get("schema_version") or 0)
    if schema < SCHEMA_VERSION:
        return None
    document = payload.get("document") or {}
    if schema >= 3 and not str(document.get("markdown") or "").strip():
        return None
    scene = str(meta.get("scene") or "")
    answer = str(payload.get("answer") or "")
    verse_span = int(meta.get("verse_span") or 1)
    depth = _cached_depth(meta)
    if depth == "flash" and verse_span >= 6:
        return None
    if scene and answer:
        from ..ai.answer_structured import needs_structure_repair
        from ..ai.output_plan import depth_kwargs_from_plan
        from ..ai.parse_output import verse_explain_incomplete

        plan = meta.get("output_plan") or {}
        dk = depth_kwargs_from_plan(plan if isinstance(plan, dict) else None)
        if needs_structure_repair(
            answer,
            scene,
            narrow=bool(meta.get("narrow")),
            verse_span=verse_span,
        ):
            return None
        if scene in ("verse_full", "verse_quick") and verse_explain_incomplete(
            scene,
            answer,
            verse_span=verse_span,
            depth=depth or dk.get("depth"),
            expected_sections=dk.get("expected_sections"),
            min_complete=dk.get("min_complete"),
        ):
            return None
    return dict(payload)


def get_answer(key: str) -> dict[str, Any] | None:
    ttl = max(0, int(get_settings().rag_answer_cache_ttl))
    if ttl <= 0 or not key:
        return None
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit:
            ts, payload = hit
            if now - ts < ttl:
                validated = _validate_payload(payload)
                if validated:
                    return validated
            _cache.pop(key, None)
    from .answer_cache_redis import redis_get

    remote = redis_get(key)
    if not remote:
        return None
    validated = _validate_payload(remote)
    if not validated:
        return None
    with _lock:
        _cache[key] = (time.monotonic(), validated)
    return validated


_DEPTH_RANK = {"flash": 0, "standard": 1, "deep": 2, "study": 3}


def _depth_rank(meta: dict[str, Any]) -> int:
    depth = _cached_depth(meta) or "standard"
    return _DEPTH_RANK.get(str(depth), 1)


def put_answer(key: str, payload: dict[str, Any]) -> None:
    ttl = max(0, int(get_settings().rag_answer_cache_ttl))
    if ttl <= 0 or not key:
        return
    now = time.monotonic()
    body = dict(payload)
    new_meta = body.get("meta") or {}
    new_rank = _depth_rank(new_meta if isinstance(new_meta, dict) else {})
    new_source = str(body.get("source") or "")
    with _lock:
        existing = _cache.get(key)
        if existing:
            _, old_payload = existing
            old_meta = old_payload.get("meta") or {}
            old_rank = _depth_rank(old_meta if isinstance(old_meta, dict) else {})
            old_source = str(old_payload.get("source") or "")
            if old_rank > new_rank:
                return
            if old_source not in ("prewarm", "") and new_source == "prewarm":
                return
        _cache[key] = (now, body)
        if len(_cache) > _MAX_ENTRIES:
            oldest_key = min(_cache.items(), key=lambda x: x[1][0])[0]
            _cache.pop(oldest_key, None)
    from .answer_cache_redis import redis_put

    redis_put(key, body)


def _ref_matches_prefix(ref: str, prefix: str) -> bool:
    if not ref or not prefix:
        return False
    if ref == prefix:
        return True
    return ref.startswith(prefix + ".")


def clear_answer_cache() -> None:
    with _lock:
        _cache.clear()
    from .answer_cache_redis import redis_clear_all

    redis_clear_all()


def clear_answer_cache_for_ref_prefix(ref_prefix: str, *, max_verse: int = 176) -> int:
    """按 ref 前缀清理答案缓存（如 JHN.13 → 整章各节与区间）。"""
    prefix = normalize_ref(ref_prefix)
    if not prefix:
        return 0
    to_del: set[str] = set()
    with _lock:
        for k, (_, payload) in _cache.items():
            meta = payload.get("meta") or {}
            ref = normalize_ref(meta.get("ref") or "")
            if ref and _ref_matches_prefix(ref, prefix):
                to_del.add(k)

        parts = prefix.split(".")
        if len(parts) >= 2 and parts[-1].isdigit():
            book, chapter = parts[0], parts[-1]
            base = f"{book}.{chapter}"
            refs = [base, prefix]
            for v in range(1, max_verse + 1):
                refs.append(f"{base}.{v}")
            for scene in ("verse_full", "verse_quick"):
                for ref in refs:
                    to_del.add(
                        cache_key(
                            ref=ref,
                            mode="explain",
                            question=None,
                            scene=scene,
                            verse_span=1,
                        )
                    )

        for k in to_del:
            _cache.pop(k, None)
    from .answer_cache_redis import redis_clear_for_ref_prefix

    return len(to_del) + redis_clear_for_ref_prefix(ref_prefix, max_verse=max_verse)
