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
    return ranked[: max(1, top_k)]
