"""结构化 AnswerDraft → Markdown（对接现有 AnswerText 渲染）。"""
from __future__ import annotations

from .answer_schema import SUMMARY_LEAD_TITLES, budget_for_scene
from .parse_output import compact_followup


def render_answer_draft(
    draft: dict,
    scene: str,
    *,
    narrow: bool = False,
    followups: list[str] | None = None,
) -> str:
    bud = budget_for_scene(scene, narrow=narrow)
    summary_max = bud.summary_max if bud else 40
    item_max = bud.item_max if bud else 55

    parts: list[str] = []
    summary = str(draft.get("summary") or "").strip()
    if summary:
        parts.extend(["### 摘要", _trim(summary, summary_max), ""])

    for sec in draft.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        title = str(sec.get("title") or "").strip()
        if not title or title == "摘要":
            continue
        parts.append(f"### {title}")
        if title in SUMMARY_LEAD_TITLES:
            items = sec.get("items") or []
            lead = str(
                sec.get("text") or (items[0] if isinstance(items, list) and items else "")
            ).strip()
            parts.append(_trim(lead, summary_max))
            parts.append("")
            continue
        items = sec.get("items") or []
        if isinstance(items, str):
            items = [items]
        for raw in items:
            item = _trim(str(raw).strip(), item_max)
            if item:
                parts.append(f"- {item}")
        if not items and sec.get("text"):
            parts.append(_trim(str(sec["text"]).strip(), item_max * 3))
        parts.append("")

    body = "\n".join(parts).strip()
    fps = followups or []
    if not fps:
        raw_fps = draft.get("followups") or []
        if isinstance(raw_fps, list):
            fps = [compact_followup(str(x)) for x in raw_fps if str(x).strip()]
    if fps:
        body += "\n\n### 相关追问\n"
        body += "\n".join(f"- {q}" for q in fps[:3])
    return body.strip()


def _trim(text: str, limit: int) -> str:
    s = text.strip()
    if len(s) <= limit:
        return s
    cut = s[:limit].rstrip("，,、；; ")
    return cut + "…"
