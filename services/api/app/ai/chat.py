"""小爱对话编排：解析经文 → 检索注释 → 组装提示词与脚注。"""
from __future__ import annotations

import logging
import re

from ..bible import reader
from ..bible.refs import parse_ref
from ..rag.retrieve import retrieve
from .prompts import DEFAULT_MODE, MODES, build_messages
from .scenes import NO_RAG_SURFACES, resolve_scene

logger = logging.getLogger(__name__)

SNIPPET_CHARS = 260
MAX_CITATIONS = 4


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


_STOP = {"什么", "怎么", "为什么", "如何", "这节", "这段", "经文", "意思", "讲的",
         "讲什么", "请问", "可以", "我们", "他们", "关于", "以及"}


def _keywords(text: str, limit: int = 8) -> list[str]:
    kws: list[str] = []
    for run in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        if run not in _STOP:
            kws.append(run)
        for i in range(len(run) - 1):
            bigram = run[i:i + 2]
            if bigram not in _STOP:
                kws.append(bigram)
    kws.extend(re.findall(r"[A-Za-z]{3,}", text))
    seen: list[str] = []
    for k in kws:
        if k not in seen:
            seen.append(k)
    return seen[:limit]


def _retrieve_hits(query: str, book_name: str | None) -> list[dict]:
    if not query:
        return []
    try:
        hits: list[dict] = []
        if book_name:
            hits = retrieve(
                query,
                top_k=MAX_CITATIONS,
                source_type="commentary",
                title_contains=book_name,
            )
        if not hits:
            hits = retrieve(
                query,
                top_k=MAX_CITATIONS,
                source_type="commentary",
                keywords=_keywords(query),
                candidate_limit=1200,
            )
        return hits
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
    spec = resolve_scene(scene, mode)
    effective_mode = spec.mode if spec.mode in MODES else DEFAULT_MODE
    ref = parse_ref(ref_raw) if ref_raw else None

    passage_display = ref.display if ref else "（未指定经文）"
    passage_text = _passage_text(ref) if ref else ""

    use_rag = spec.use_rag and (surface or "") not in NO_RAG_SURFACES

    citations: list[dict] = []
    if use_rag:
        query = f"{passage_display if ref else ''} {passage_text} {question or ''}".strip()
        hits = _retrieve_hits(query, ref.book_name if ref else None)
    else:
        hits = []
    for i, h in enumerate(hits, start=1):
        citations.append(
            {
                "n": i,
                "title": h.get("title"),
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
