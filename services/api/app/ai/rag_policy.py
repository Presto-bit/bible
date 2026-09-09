"""RAG 启用策略：何时跳过检索以缩短首 token。"""
from __future__ import annotations


def skip_rag_for_passage(
    *,
    surface: str | None,
    scene_id: str,
    question: str | None,
    ref,
    verse_span: int,
    has_prior_turns: bool,
) -> bool:
    """仅后台 prewarm 跳过 RAG；用户可见首问保留脚注检索。"""
    _ = (question, verse_span, has_prior_turns, ref)
    if scene_id not in ("verse_full", "verse_quick"):
        return False
    surf = (surface or "").strip().lower()
    return surf == "prewarm"
