"""双语依据卡：为英文（等）摘录生成中文释义并缓存。"""
from __future__ import annotations

import hashlib
import logging
import threading

from ..db import get_pool
from .llm import complete_chat

logger = logging.getLogger(__name__)

_SCHEMA_READY = False
_SCHEMA_LOCK = threading.Lock()

_ENSURE_SQL = """
CREATE TABLE IF NOT EXISTS citation_explain_cache (
  snippet_hash TEXT PRIMARY KEY,
  explain_zh TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

_DISCLAIMER = "以下中文为便于阅读的释义，非官方译本；请以圣经与原文摘录为准。"


def snippet_hash(snippet: str) -> str:
    return hashlib.sha256((snippet or "").strip().encode("utf-8")).hexdigest()


def ensure_explain_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        try:
            pool = get_pool()
            with pool.connection() as conn:
                conn.execute(_ENSURE_SQL)
                conn.commit()
            _SCHEMA_READY = True
        except Exception:
            logger.exception("citation_explain_cache schema failed")


def _cache_get(h: str) -> str | None:
    try:
        ensure_explain_schema()
        pool = get_pool()
        with pool.connection() as conn:
            row = conn.execute(
                "SELECT explain_zh FROM citation_explain_cache WHERE snippet_hash = %s",
                (h,),
            ).fetchone()
            return row[0] if row else None
    except Exception:
        return None


def _cache_put(h: str, text: str) -> None:
    try:
        ensure_explain_schema()
        pool = get_pool()
        with pool.connection() as conn:
            conn.execute(
                "INSERT INTO citation_explain_cache (snippet_hash, explain_zh) "
                "VALUES (%s, %s) ON CONFLICT (snippet_hash) DO NOTHING",
                (h, text),
            )
            conn.commit()
    except Exception:
        logger.warning("citation explain cache write failed", exc_info=True)


def _looks_mostly_cjk(text: str) -> bool:
    if not text:
        return False
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    return cjk >= max(8, len(text) // 4)


def explain_citation_snippet(
    *,
    title: str,
    snippet: str,
    force: bool = False,
) -> dict:
    """返回双语依据卡字段。中文资料弱化为要点摘要。"""
    snip = (snippet or "").strip()
    tit = (title or "").strip() or "释经资料"
    if not snip:
        return {
            "title": tit,
            "explain_zh": "",
            "snippet": "",
            "disclaimer": _DISCLAIMER,
            "cached": False,
            "skipped": True,
            "reason": "empty_snippet",
        }

    h = snippet_hash(snip)
    if not force:
        cached = _cache_get(h)
        if cached:
            return {
                "title": tit,
                "explain_zh": cached,
                "snippet": snip,
                "disclaimer": _DISCLAIMER,
                "cached": True,
                "snippet_hash": h,
            }

    if _looks_mostly_cjk(snip):
        # 已是中文：短摘要即可
        explain = snip[:120] + ("…" if len(snip) > 120 else "")
        _cache_put(h, explain)
        return {
            "title": tit,
            "explain_zh": explain,
            "snippet": snip,
            "disclaimer": _DISCLAIMER,
            "cached": False,
            "snippet_hash": h,
            "source_lang": "zh",
        }

    prompt = (
        "你是圣经研经助手。下面是一条释经/词典资料的原文摘录（可能是英文）。"
        "请用简体中文写一段便于阅读的释义，80～120 字，准确概括要点，不要添加原文没有的教义断言，"
        "不要自称官方译本。只输出释义正文，不要标题或前后缀。\n\n"
        f"资料标题：{tit}\n\n原文摘录：\n{snip[:1200]}"
    )
    try:
        explain = complete_chat(
            [{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=220,
        ).strip()
    except Exception as exc:
        logger.warning("citation explain failed: %s", exc)
        return {
            "title": tit,
            "explain_zh": "",
            "snippet": snip,
            "disclaimer": _DISCLAIMER,
            "cached": False,
            "error": "暂无法生成中文释义",
            "snippet_hash": h,
        }

    if explain:
        _cache_put(h, explain)
    return {
        "title": tit,
        "explain_zh": explain,
        "snippet": snip,
        "disclaimer": _DISCLAIMER,
        "cached": False,
        "snippet_hash": h,
    }
