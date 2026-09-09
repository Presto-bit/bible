"""结构化生成与结构修复（半屏释经 / 缺节补形）。"""
from __future__ import annotations

import json
import logging
import re

from .answer_normalize import is_prose_wall, normalize_answer_markdown
from .answer_render import render_answer_draft
from .answer_schema import (
    missing_required_sections,
    required_sections,
    SCENE_BUDGETS,
)
from .llm import complete_chat

logger = logging.getLogger(__name__)

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

_VERSE_JSON_GUIDE = (
    "【JSON 输出】仅输出一个 JSON 对象，不要 Markdown，不要解释：\n"
    '{"summary":"≤40字","sections":[{"title":"经文背景","items":["≤55字","..."]},'
    '{"title":"经文解释","items":["...","..."]}]}\n'
    "sections 顺序与必需小节一致；items 为字符串数组。"
)

_VERSE_PASSAGE_JSON_GUIDE = (
    "【JSON 输出】仅输出一个 JSON 对象，不要 Markdown，不要解释：\n"
    '{"summary":"≤50字","sections":['
    '{"title":"经文背景","items":["≤78字","≤78字"]},'
    '{"title":"段落脉络","items":["≤78字","≤78字","≤78字"]},'
    '{"title":"经文解释","items":["≤78字","≤78字","≤78字","≤78字","≤78字"]}'
    ']}\n'
    "共多节经文：按整段主线归纳，禁止逐节罗列；sections 顺序固定。"
)

_VERSE_MID_SPAN_JSON_GUIDE = (
    "【JSON 输出】仅输出一个 JSON 对象，不要 Markdown，不要解释：\n"
    '{"summary":"≤42字","sections":[{"title":"经文背景","items":["≤55字","..."]},'
    '{"title":"经文解释","items":["...","...","..."]}]}\n'
    "sections 顺序与必需小节一致；items 为字符串数组。"
)

_VERSE_QUICK_JSON_GUIDE = (
    "【JSON 输出】仅输出一个 JSON 对象：\n"
    '{"summary":"≤40字","sections":[{"title":"经文解释","items":["≤55字","...","..."]}]}\n'
)


def _strip_json_fence(raw: str) -> str:
    return _JSON_FENCE_RE.sub("", raw.strip()).strip()


def parse_answer_json(raw: str) -> dict | None:
    text = _strip_json_fence(raw)
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return None
        text = text[start : end + 1]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _verse_json_guide(scene: str, verse_span: int = 1) -> str:
    if scene == "verse_quick":
        return _VERSE_QUICK_JSON_GUIDE
    span = max(1, int(verse_span or 1))
    if span >= 6:
        return _VERSE_PASSAGE_JSON_GUIDE
    if span >= 3:
        return _VERSE_MID_SPAN_JSON_GUIDE
    return _VERSE_JSON_GUIDE


def _chat_json_guide(scene: str) -> str | None:
    """Tab 释经类 scene：JSON 成稿指引（与 REQUIRED_SECTIONS 对齐）。"""
    if scene not in SCENE_BUDGETS or not scene.startswith("chat_"):
        return None
    if scene in ("chat_compare", "chat_original", "chat_general", "chat_viewpoints"):
        return None
    body_sections = [s for s in required_sections(scene, narrow=False) if s != "摘要"]
    if not body_sections:
        return None
    sec_json = ",".join(
        f'{{"title":"{title}","items":["≤60字","..."]}}' for title in body_sections
    )
    return (
        "【JSON 输出】仅输出一个 JSON 对象，不要 Markdown，不要解释：\n"
        f'{{"summary":"≤40字","sections":[{sec_json}]}}\n'
        "sections 顺序与必需小节一致；items 为字符串数组。"
    )


def try_structured_chat_answer(
    messages: list[dict[str, str]],
    scene: str,
    *,
    max_tokens: int,
    verse_span: int = 1,
    narrow: bool = False,
) -> str | None:
    """Tab 释经：JSON 生成 → Markdown；失败返回 None。"""
    guide = _chat_json_guide(scene)
    if not guide:
        return None
    msgs = [dict(m) for m in messages]
    if msgs and msgs[0]["role"] == "system":
        msgs[0] = {
            "role": "system",
            "content": msgs[0]["content"] + "\n" + guide,
        }
    try:
        raw = complete_chat(msgs, max_tokens=min(max_tokens, 900), temperature=0.25)
    except Exception:
        logger.exception("structured chat answer failed scene=%s", scene)
        return None
    draft = parse_answer_json(raw)
    if not draft:
        if "###" in raw or "【摘要】" in raw:
            return normalize_answer_markdown(
                raw,
                scene,
                narrow=narrow,
                verse_span=verse_span,
            )
        return None
    summary = str(draft.get("summary") or "").strip()
    if not summary:
        return None
    md = render_answer_draft(draft, scene, narrow=narrow)
    normalized = normalize_answer_markdown(
        md,
        scene,
        narrow=narrow,
        verse_span=verse_span,
    )
    return normalized if normalized.strip() else None


def try_structured_verse_answer(
    messages: list[dict[str, str]],
    scene: str,
    *,
    max_tokens: int,
    verse_span: int = 1,
) -> str | None:
    """半屏释经：JSON 生成 → Markdown；失败返回 None。"""
    if scene not in ("verse_full", "verse_quick"):
        return None
    msgs = [dict(m) for m in messages]
    if msgs and msgs[0]["role"] == "system":
        msgs[0] = {
            "role": "system",
            "content": msgs[0]["content"] + "\n" + _verse_json_guide(scene, verse_span),
        }
    try:
        raw = complete_chat(msgs, max_tokens=min(max_tokens, 900), temperature=0.25)
    except Exception:
        logger.exception("structured verse answer failed scene=%s", scene)
        return None
    draft = parse_answer_json(raw)
    if not draft:
        if "###" in raw or "【摘要】" in raw:
            return normalize_answer_markdown(raw, scene, verse_span=verse_span)
        return None
    titles = {str(s.get("title") or "").strip() for s in draft.get("sections") or [] if isinstance(s, dict)}
    summary = str(draft.get("summary") or "").strip()
    if not summary:
        for sec in draft.get("sections") or []:
            if isinstance(sec, dict) and str(sec.get("title") or "").strip() == "摘要":
                items = sec.get("items") or []
                if items:
                    summary = str(items[0]).strip()
                    draft["summary"] = summary
                break
    if not summary:
        return None
    md = render_answer_draft(draft, scene)
    normalized = normalize_answer_markdown(md, scene, verse_span=verse_span)
    return normalized if normalized.strip() else None


def needs_structure_repair(
    body_text: str,
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
) -> bool:
    if not body_text.strip():
        return True
    if missing_required_sections(
        body_text,
        scene,
        narrow=narrow,
        verse_span=verse_span,
    ):
        return True
    if not narrow and is_prose_wall(body_text, scene):
        return True
    return False


def repair_answer_structure(
    messages: list[dict[str, str]],
    body_text: str,
    scene: str,
    *,
    narrow: bool = False,
    max_tokens: int = 600,
    verse_span: int = 1,
) -> str | None:
    """一次性格式修复：补缺失小节 / 散文转列表。"""
    missing = missing_required_sections(
        body_text,
        scene,
        narrow=narrow,
        verse_span=verse_span,
    )
    prose = is_prose_wall(body_text, scene)
    if not missing and not prose:
        return None
    hints: list[str] = []
    if missing:
        hints.append(f"补写缺失小节：{'、'.join(missing)}")
    if prose:
        hints.append("将散文段改为 ### 标题下 - 列表要点")
    if narrow:
        hints.append("Chip 短追问：仅 ### 摘要 + 2–3 条要点，约 120–180 字")
    repair_user = (
        "请把上一条 assistant 回答重排为规范 Markdown。"
        + "；".join(hints)
        + "。不要重复已说信息，不要明显加长，只输出 Markdown 正文。"
    )
    cont = messages + [
        {"role": "assistant", "content": body_text},
        {"role": "user", "content": repair_user},
    ]
    try:
        repaired = complete_chat(cont, max_tokens=min(max_tokens, 700), temperature=0.2)
    except Exception:
        logger.exception("structure repair failed scene=%s", scene)
        return None
    return repaired.strip() or None


def _message_variants(messages: list[dict[str, str]]) -> list[list[dict[str, str]]]:
    """空响应恢复：优先短上下文（去 history），再试完整 messages。"""
    variants: list[list[dict[str, str]]] = []
    if len(messages) > 2:
        variants.append([dict(messages[0]), dict(messages[-1])])
    variants.append([dict(m) for m in messages])
    seen: set[str] = set()
    out: list[list[dict[str, str]]] = []
    for v in variants:
        key = repr([(m.get("role"), m.get("content")) for m in v])
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
    return out


def _normalize_recovered(
    raw: str,
    scene: str,
    *,
    verse_span: int,
) -> str | None:
    text = normalize_answer_markdown(
        raw,
        scene,
        narrow=False,
        verse_span=verse_span,
    )
    if text.strip():
        return text
    stripped = raw.strip()
    return stripped if stripped else None


def recover_incomplete_verse_answer(
    messages: list[dict[str, str]],
    scene: str,
    *,
    max_tokens: int,
    verse_span: int = 1,
) -> str | None:
    """终稿仍 incomplete 时的静默重试：非流式一次成稿（structured 已试过则跳过）。"""
    scene = (scene or "").strip()
    if scene not in ("verse_full", "verse_quick"):
        return None
    recovery_tokens = max(int(max_tokens), 900)
    nudge = (
        "\n\n【重要】请一次性输出完整 Markdown 成稿："
        "须含全部规定 ### 小节与足够 - 列表要点；"
        "写完后自然停笔，不要思考过程，不要留半成品，不要写「（续）」类标题。"
    )
    for variant in _message_variants(messages):
        base_msgs = [dict(m) for m in variant]
        if base_msgs and base_msgs[-1].get("role") == "user":
            base_msgs[-1] = {
                "role": "user",
                "content": str(base_msgs[-1].get("content") or "") + nudge,
            }
        for budget in (min(recovery_tokens, 900), min(recovery_tokens, 700)):
            try:
                raw = complete_chat(base_msgs, max_tokens=budget, temperature=0.4)
            except Exception:
                logger.exception(
                    "recover_incomplete_verse_answer failed scene=%s", scene
                )
                continue
            if not raw.strip():
                continue
            text = _normalize_recovered(raw, scene, verse_span=verse_span)
            if text:
                return text
    return None


def recover_empty_response(
    messages: list[dict[str, str]],
    scene: str,
    *,
    max_tokens: int,
    verse_span: int = 1,
    narrow: bool = False,
    message_variants: list[list[dict[str, str]]] | None = None,
) -> str | None:
    """流式零 delta 时的多级兜底（半屏 / Tab 释经优先 structured）。"""
    scene = (scene or "").strip()
    recovery_tokens = max(int(max_tokens), 900)
    base_variants = _message_variants(messages)
    if message_variants:
        merged: list[list[dict[str, str]]] = []
        seen: set[str] = set()
        for v in [*message_variants, *base_variants]:
            key = repr([(m.get("role"), m.get("content")) for m in v])
            if key in seen:
                continue
            seen.add(key)
            merged.append(v)
        variants = merged
    else:
        variants = base_variants

    nudge = (
        "\n\n请直接用 Markdown 输出成稿答案（含 ### 小节与 - 列表），"
        "不要输出思考过程，不要留空。"
    )

    for variant in variants:
        if scene in ("verse_full", "verse_quick"):
            md = try_structured_verse_answer(
                variant,
                scene,
                max_tokens=recovery_tokens,
                verse_span=verse_span,
            )
            if md and md.strip():
                return md

        if scene.startswith("chat_"):
            md = try_structured_chat_answer(
                variant,
                scene,
                max_tokens=recovery_tokens,
                verse_span=verse_span,
                narrow=False,
            )
            if md and md.strip():
                return md

        base_msgs = [dict(m) for m in variant]
        if base_msgs and base_msgs[-1].get("role") == "user":
            base_msgs[-1] = {
                "role": "user",
                "content": str(base_msgs[-1].get("content") or "") + nudge,
            }

        for budget in (min(recovery_tokens, 900), min(recovery_tokens, 700)):
            try:
                raw = complete_chat(base_msgs, max_tokens=budget, temperature=0.45)
            except Exception:
                logger.exception("recover_empty_response failed scene=%s", scene)
                continue
            if not raw.strip():
                continue
            if scene in ("verse_full", "verse_quick"):
                draft = parse_answer_json(raw)
                if draft:
                    md = render_answer_draft(draft, scene)
                    md = _normalize_recovered(md, scene, verse_span=verse_span)
                    if md:
                        return md
            text = _normalize_recovered(raw, scene, verse_span=verse_span)
            if text:
                return text
    return None
