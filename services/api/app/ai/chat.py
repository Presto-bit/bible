"""小爱对话编排：解析经文 → 检索注释 → 组装提示词与脚注。"""
from __future__ import annotations

import logging
import re

from ..bible import reader
from ..bible.refs import parse_ref
from ..rag.retrieve import retrieve
from .prompts import DEFAULT_MODE, MODES, build_messages

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


def _sanitize_history(history: list[dict] | None) -> list[dict[str, str]]:
    """客户端本地持有的多轮对话（local-first），裁剪并校验后拼入上下文。"""
    if not history:
        return []
    out: list[dict[str, str]] = []
    for turn in history[-MAX_HISTORY_TURNS:]:
        role = str(turn.get("role") or "").strip().lower()
        content = str(turn.get("content") or "").strip()
        if role in _VALID_ROLES and content:
            out.append({"role": role, "content": content})
    return out


_STOP = {"什么", "怎么", "为什么", "如何", "这节", "这段", "经文", "意思", "讲的",
         "讲什么", "请问", "可以", "我们", "他们", "关于", "以及"}


def _keywords(text: str, limit: int = 8) -> list[str]:
    """从中文/英文查询抽取关键词用于 ILIKE 预过滤。

    中文无分词器：取连续 CJK 串本身 + 其相邻二元组，配合英文长词；去停用词、去重。
    """
    kws: list[str] = []
    for run in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        if run not in _STOP:
            kws.append(run)
        # 二元组提升召回（如 “因信称义” → 因信/信称/称义）
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
    """注释检索：有书卷先按卷过滤；命中 0（语料缺卷）或无 ref 时回退关键词全库检索。"""
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
            # 全库回退：关键词预过滤 → 主题相关候选 → 混合重排
            hits = retrieve(
                query,
                top_k=MAX_CITATIONS,
                source_type="commentary",
                keywords=_keywords(query),
                candidate_limit=1200,
            )
        return hits
    except Exception as exc:
        # 注释库/向量库不可用时降级为无脚注作答
        logger.warning("注释检索不可用，降级无脚注：%s", exc)
        return []


def prepare(
    *,
    ref_raw: str | None,
    question: str | None,
    mode: str,
    history: list[dict] | None = None,
) -> dict:
    """返回 {meta, messages}；meta 含 ref/display/citations 供前端展示脚注。

    history：客户端持有的既往对话（[{role,content}]），用于多轮跟进保持上下文。
    """
    mode = mode if mode in MODES else DEFAULT_MODE
    ref = parse_ref(ref_raw) if ref_raw else None

    passage_display = ref.display if ref else "（未指定经文）"
    passage_text = _passage_text(ref) if ref else ""

    citations: list[dict] = []
    query = f"{passage_display if ref else ''} {passage_text} {question or ''}".strip()
    hits = _retrieve_hits(query, ref.book_name if ref else None)
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
        mode=mode,
        passage_display=passage_display,
        passage_text=passage_text,
        question=question,
        citations=citations,
    )
    # [system] + 既往多轮 + [本轮 user]
    prior = _sanitize_history(history)
    messages = [base[0], *prior, base[1]]
    meta = {
        "mode": mode,
        "mode_label": MODES.get(mode),
        "ref": ref.osis if ref else None,
        "display": passage_display,
        "citations": [{"n": c["n"], "title": c["title"], "score": c["score"]} for c in citations],
    }
    return {"meta": meta, "messages": messages}
