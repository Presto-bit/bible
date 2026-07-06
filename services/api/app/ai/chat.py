"""小爱对话编排：解析经文 → 检索注释 → 组装提示词与脚注。"""
from __future__ import annotations

import logging
import re

from ..bible import reader
from ..bible.refs import parse_ref
from ..rag.retrieve import retrieve_for_passage
from .citations import display_citation_title
from .prompts import DEFAULT_MODE, MODES, build_messages
from .scenes import NO_RAG_SURFACES, resolve_scene

logger = logging.getLogger(__name__)

SNIPPET_CHARS = 260
MAX_CITATIONS = 4
RAG_SOURCE_TYPES = ["commentary", "reference-en", "study-bible-zh", "commentary-zh"]


def _passage_text(ref) -> str:
    if ref.chapter is None:
        return ""
    if ref.verse_start is not None:
        verses = reader.get_verses(ref.book_id, ref.chapter, ref.verse_start, ref.verse_end)
    else:
        verses = reader.get_chapter(ref.book_id, ref.chapter)
    return " ".join(v["text"] for v in verses).strip()


_VALID_ROLES = {"user", "assistant"}
MAX_HISTORY_TURNS = 12

_FOLLOWUP_TAIL_RE = re.compile(
    r"\n[ \t]*(?:【相关追问】|\[相关追问\]|相关追问\s*[:：])[\s\S]*$"
)


def _strip_followups_for_history(content: str) -> str:
    return _FOLLOWUP_TAIL_RE.sub("", content).strip()


def _sanitize_history(history: list[dict] | None) -> list[dict[str, str]]:
    """客户端本地持有的多轮对话（local-first），裁剪并校验后拼入上下文。"""
    if not history:
        return []
    out: list[dict[str, str]] = []
    for turn in history[-MAX_HISTORY_TURNS:]:
        role = str(turn.get("role") or "").strip().lower()
        content = str(turn.get("content") or "").strip()
        if role not in _VALID_ROLES or not content:
            continue
        if role == "assistant":
            content = _strip_followups_for_history(content)
        if content:
            out.append({"role": role, "content": content})
    return out


def _retrieve_hits(
    query: str,
    book_name: str | None,
    book_id: str | None = None,
    chapter: int | None = None,
) -> list[dict]:
    if not query:
        return []
    try:
        return retrieve_for_passage(
            query,
            book_name=book_name,
            book_id=book_id,
            chapter=chapter,
            top_k=MAX_CITATIONS,
            source_types=RAG_SOURCE_TYPES,
        )
    except Exception as exc:
        logger.warning("注释检索不可用，降级无脚注：%s", exc)
        return []


def prepare(
    *,
    ref_raw: str | None,
    question: str | None,
    mode: str,
    scene: str | None = None,
    history: list[dict] | None = None,
    surface: str | None = None,
) -> dict:
    """返回 {meta, messages, max_tokens}。"""
    ref = parse_ref(ref_raw) if ref_raw else None
    spec = resolve_scene(scene, mode, has_ref=ref is not None)

    passage_display = ref.display if ref else "（未指定经文）"
    passage_text = _passage_text(ref) if ref else ""
    effective_mode = spec.mode if spec.mode in MODES else DEFAULT_MODE

    use_rag = spec.use_rag and (surface or "") not in NO_RAG_SURFACES

    citations: list[dict] = []
    if use_rag:
        query = f"{passage_display if ref else ''} {passage_text} {question or ''}".strip()
        hits = _retrieve_hits(
            query,
            ref.book_name if ref else None,
            ref.book_id if ref else None,
            ref.chapter if ref else None,
        )
    else:
        hits = []
    for i, h in enumerate(hits, start=1):
        citations.append(
            {
                "n": i,
                "title": display_citation_title(h.get("title"), ref.book_name if ref else None),
                "snippet": h["chunk_text"][:SNIPPET_CHARS].strip(),
                "score": round(float(h["score"]), 4),
            }
        )

    base = build_messages(
        scene=spec,
        passage_display=passage_display,
        passage_text=passage_text,
        question=question,
        citations=citations,
        use_rag=use_rag,
    )
    prior = _sanitize_history(history)
    messages = [base[0], *prior, base[1]]
    meta = {
        "scene": spec.id,
        "scene_label": spec.label,
        "mode": effective_mode,
        "mode_label": MODES.get(effective_mode),
        "wants_followups": spec.wants_followups,
        "use_rag": use_rag,
        "surface": surface,
        "ref": ref.osis if ref else None,
        "display": passage_display,
        "citations": [
            {
                "n": c["n"],
                "title": c["title"],
                "score": c["score"],
                "snippet": c["snippet"],
            }
            for c in citations
        ],
    }
    return {"meta": meta, "messages": messages, "max_tokens": spec.max_tokens}
