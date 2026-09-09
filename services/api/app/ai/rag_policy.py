"""RAG 启用策略：何时跳过检索以缩短首 token。"""
from __future__ import annotations

from .depth_router import is_default_explain


def skip_rag_for_passage(
    *,
    surface: str | None,
    scene_id: str,
    question: str | None,
    ref,
    verse_span: int,
    has_prior_turns: bool,
) -> bool:
    """经文已在 prompt 时跳过 RAG，缩短首 token（首问默认解读 / 半屏 / prewarm）。"""
    if scene_id not in ("verse_full", "verse_quick"):
        return False
    if not ref:
        return False
    if has_prior_turns:
        return False
    surf = (surface or "").strip().lower()
    if surf in {"half_sheet", "prewarm"}:
        return True
    q = (question or "").strip()
    if not q or is_default_explain(question):
        return True
    return False
