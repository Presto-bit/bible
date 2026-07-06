"""RAG 核心：切块 + 关键词/向量打分 + 混合排序。

移植自 minimax_aipodcast `rag_core.py`，去除 orchestrator 耦合，保留：
  • split_text_into_chunks（Markdown 标题优先 → 空行分段 → 定长重叠）
  • _tokenize / keyword_score（中英混合：英文词 + CJK bigram + unigram）
  • cosine / min-max 归一
  • hybrid_rank（关键词 0.4 + 向量 0.6，持久库默认权重）

向量本身由 EmbeddingProvider 提供（见 embedding.py）；本模块只做切块与打分，无网络依赖，便于单测。
"""
from __future__ import annotations

import math
import re
from collections.abc import Callable

DEFAULT_CHUNK_CHARS = 900
DEFAULT_OVERLAP = 70
# 持久库混合权重（与 .env RAG_HYBRID_* 对齐；检索期可覆盖）
DEFAULT_VECTOR_WEIGHT = 0.6
DEFAULT_KEYWORD_WEIGHT = 0.4


def _split_plain_paragraphs(raw: str, mc: int, ov: int) -> list[str]:
    """按空行分段，再按长度切分，带少量重叠避免句断在边界。"""
    paragraphs = re.split(r"\n\s*\n+", raw.strip())
    pieces: list[str] = []
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        if len(p) <= mc:
            pieces.append(p)
            continue
        start = 0
        while start < len(p):
            end = min(len(p), start + mc)
            chunk = p[start:end].strip()
            if chunk:
                pieces.append(chunk)
            if end >= len(p):
                break
            start = max(0, end - ov)
    return pieces


def split_text_into_chunks(
    text: str,
    *,
    max_chunk_chars: int | None = None,
    overlap: int | None = None,
) -> list[str]:
    """优先在 Markdown 行首标题处切段，再按空行与长度切分，带少量重叠。"""
    raw = (text or "").strip()
    if not raw:
        return []
    mc = max(400, int(max_chunk_chars or DEFAULT_CHUNK_CHARS))
    ov = max(0, min(mc // 4, int(overlap if overlap is not None else DEFAULT_OVERLAP)))

    if re.search(r"(?m)^#{1,6}\s+\S", raw):
        sections = [s.strip() for s in re.split(r"(?m)(?=^#{1,6}\s+\S)", raw) if s.strip()]
        if len(sections) > 1:
            pieces: list[str] = []
            for sec in sections:
                pieces.extend(_split_plain_paragraphs(sec, mc, ov))
            return pieces
    return _split_plain_paragraphs(raw, mc, ov)


def split_text_into_chunks_with_meta(
    text: str,
    *,
    max_chunk_chars: int | None = None,
    overlap: int | None = None,
    section_meta_fn: Callable[[str], dict] | None = None,
    base_meta: dict | None = None,
) -> list[tuple[str, dict]]:
    """按 Markdown 标题切段，并为每块附带从标题解析的 meta（章/节等）。"""
    raw = (text or "").strip()
    if not raw:
        return []
    mc = max(400, int(max_chunk_chars or DEFAULT_CHUNK_CHARS))
    ov = max(0, min(mc // 4, int(overlap if overlap is not None else DEFAULT_OVERLAP)))
    base = dict(base_meta or {})
    section_meta = dict(base)
    items: list[tuple[str, dict]] = []

    def emit(sec_text: str, meta: dict) -> None:
        for chunk in _split_plain_paragraphs(sec_text, mc, ov):
            if chunk:
                items.append((chunk, dict(meta)))

    if re.search(r"(?m)^#{1,6}\s+\S", raw):
        sections = [s.strip() for s in re.split(r"(?m)(?=^#{1,6}\s+\S)", raw) if s.strip()]
        for sec in sections:
            m = re.match(r"^#{1,6}\s+(.+)$", sec, re.MULTILINE)
            if m:
                heading = m.group(1).strip()
                if section_meta_fn:
                    parsed = section_meta_fn(heading) or {}
                    if parsed:
                        section_meta = {**base, **parsed}
                body = sec[m.end() :].strip()
            else:
                body = sec
            emit(body, section_meta)
        return items

    emit(raw, section_meta)
    return items


def _uniform_sample(items: list, k: int) -> list:
    n = len(items)
    if n <= k:
        return items
    if k <= 1:
        return [items[0]]
    step = (n - 1) / (k - 1)
    return [items[int(round(i * step))] for i in range(k)]


def _head_tail_sample(items: list, k: int) -> list:
    n = len(items)
    if n <= k:
        return items
    quarter = max(1, k // 4)
    head_idx = list(range(quarter))
    tail_idx = list(range(n - quarter, n))
    middle_budget = max(0, k - len(head_idx) - len(tail_idx))
    middle_pool_idx = list(range(quarter, n - quarter))
    if middle_budget and middle_pool_idx:
        step = (len(middle_pool_idx) - 1) / max(1, middle_budget - 1)
        middle_idx = [middle_pool_idx[int(round(i * step))] for i in range(middle_budget)]
    else:
        middle_idx = []
    picked = sorted(set(head_idx + middle_idx + tail_idx))
    return [items[i] for i in picked[:k]]


def select_chunks_for_index(
    items: list[tuple[str, dict]],
    *,
    strategy: str = "per_chapter",
    per_chapter_min: int = 2,
    max_abs: int = 512,
) -> list[tuple[str, dict]]:
    """按入库策略从全量切块中选取子集（per_chapter / per_shard / head_tail）。"""
    if not items:
        return []
    strat = (strategy or "per_chapter").strip().lower()
    max_abs = max(1, int(max_abs))
    per_chapter_min = max(1, int(per_chapter_min))
    if len(items) <= max_abs and strat != "head_tail":
        return items

    if strat == "head_tail":
        return _head_tail_sample(items, max_abs)
    if strat == "per_shard":
        return _uniform_sample(items, max_abs)

    by_chapter: dict[str, list[int]] = {}
    for i, (_, meta) in enumerate(items):
        ch_key = str(meta.get("chapter_id") or meta.get("chapter") or "_doc")
        by_chapter.setdefault(ch_key, []).append(i)

    selected: list[int] = []
    selected_set: set[int] = set()
    for indices in by_chapter.values():
        for idx in indices[:per_chapter_min]:
            if idx not in selected_set:
                selected.append(idx)
                selected_set.add(idx)
    if len(selected) > max_abs:
        return [items[i] for i in sorted(selected)[:max_abs]]

    chapter_keys = sorted(by_chapter.keys(), key=lambda k: by_chapter[k][0])
    pointers = {k: per_chapter_min for k in chapter_keys}
    while len(selected) < max_abs:
        progressed = False
        for k in chapter_keys:
            indices = by_chapter[k]
            p = pointers[k]
            if p < len(indices):
                idx = indices[p]
                pointers[k] = p + 1
                if idx not in selected_set:
                    selected.append(idx)
                    selected_set.add(idx)
                    progressed = True
                    if len(selected) >= max_abs:
                        break
        if not progressed:
            break

    selected.sort()
    return [items[i] for i in selected]


def balance_across_documents(ranked: list[dict], top_k: int) -> list[dict]:
    """多本文献轮询取块，避免单本注释占满 Top-K。"""
    if not ranked or top_k <= 0:
        return []
    buckets: dict[str, list[dict]] = {}
    for item in ranked:
        meta = item.get("meta") or {}
        key = str(meta.get("document_id") or item.get("title") or "_")
        buckets.setdefault(key, []).append(item)
    for items in buckets.values():
        items.sort(key=lambda x: -float(x.get("score") or 0))
    keys = sorted(buckets.keys(), key=lambda k: -float(buckets[k][0].get("score") or 0))
    out: list[dict] = []
    while len(out) < top_k:
        added = False
        for k in keys:
            if buckets[k]:
                out.append(buckets[k].pop(0))
                added = True
                if len(out) >= top_k:
                    break
        if not added:
            break
    return out


def _tokenize(text: str) -> list[str]:
    """英文词 + CJK bigram + unigram，兼顾中英检索召回。"""
    t = (text or "").lower()
    words = re.findall(r"[a-z0-9_]{2,}", t)
    chars = re.findall(r"[\u4e00-\u9fff]", t)
    bigrams = [chars[i] + chars[i + 1] for i in range(len(chars) - 1)]
    return words + bigrams + chars


def keyword_score(query: str, chunk: str) -> float:
    q_toks = set(_tokenize(query))
    if not q_toks:
        return 0.0
    c_toks = _tokenize(chunk)
    if not c_toks:
        return 0.0
    c_set = set(c_toks)
    inter = len(q_toks & c_set)
    return float(inter) / (1.0 + math.log(2.0 + len(c_set)))


def cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    s = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na <= 0 or nb <= 0:
        return 0.0
    return s / (na * nb)


def norm_minmax(vals: list[float]) -> list[float]:
    if not vals:
        return []
    lo, hi = min(vals), max(vals)
    if hi <= lo + 1e-12:
        return [0.5 for _ in vals]
    return [(v - lo) / (hi - lo) for v in vals]


def hybrid_rank(
    query: str,
    candidates: list[dict],
    query_vector: list[float] | None,
    *,
    top_k: int = 8,
    vector_weight: float = DEFAULT_VECTOR_WEIGHT,
    keyword_weight: float = DEFAULT_KEYWORD_WEIGHT,
) -> list[dict]:
    """对候选块做关键词 + 向量混合排序。

    candidates: [{"chunk_text": str, "embedding": list[float]|None, "meta": dict, ...}]
    query_vector: 查询向量；为 None（如 embedding 不可用）时退化为纯关键词。
    返回带 `score` 的前 top_k，按分数降序。
    """
    if not candidates:
        return []
    kw_raw = [keyword_score(query, c.get("chunk_text", "")) for c in candidates]
    if query_vector:
        vec_raw = [
            cosine(query_vector, c.get("embedding") or []) for c in candidates
        ]
    else:
        vec_raw = [0.0] * len(candidates)
        vector_weight, keyword_weight = 0.0, 1.0

    kw_n = norm_minmax(kw_raw)
    vec_n = norm_minmax(vec_raw)
    total_w = (vector_weight + keyword_weight) or 1.0
    ranked: list[dict] = []
    for c, kn, vn, kr, vr in zip(candidates, kw_n, vec_n, kw_raw, vec_raw):
        score = (vector_weight * vn + keyword_weight * kn) / total_w
        out = dict(c)
        out["score"] = float(score)
        out["keyword_raw"] = float(kr)
        out["vector_raw"] = float(vr)
        ranked.append(out)
    ranked.sort(key=lambda x: -x["score"])
    return ranked[: max(1, top_k)] if top_k else ranked
