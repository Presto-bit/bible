"""结构化生成与结构修复（半屏释经 / 缺节补形）。"""
from __future__ import annotations

import json
import logging
import re

from .answer_normalize import is_prose_wall, normalize_answer_markdown
from .answer_render import render_answer_draft
from .answer_schema import missing_required_sections, required_sections
from .llm import complete_chat

logger = logging.getLogger(__name__)

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

_VERSE_JSON_GUIDE = (
    "【JSON 输出】仅输出一个 JSON 对象，不要 Markdown，不要解释：\n"
    '{"summary":"≤40字","sections":[{"title":"背景","items":["≤55字","..."]},'
    '{"title":"经文解释","items":["...","..."]}]}\n'
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


def _verse_json_guide(scene: str) -> str:
    if scene == "verse_quick":
        return _VERSE_QUICK_JSON_GUIDE
    return _VERSE_JSON_GUIDE


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
            "content": msgs[0]["content"] + "\n" + _verse_json_guide(scene),
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
) -> bool:
    if not body_text.strip():
        return True
    if missing_required_sections(body_text, scene, narrow=narrow):
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
) -> str | None:
    """一次性格式修复：补缺失小节 / 散文转列表。"""
    missing = missing_required_sections(body_text, scene, narrow=narrow)
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


def recover_empty_response(
    messages: list[dict[str, str]],
    scene: str,
    *,
    max_tokens: int,
    verse_span: int = 1,
    narrow: bool = False,
) -> str | None:
    """流式零 delta 时的多级兜底（半屏释经优先 structured）。"""
    scene = (scene or "").strip()
    if scene in ("verse_full", "verse_quick"):
        md = try_structured_verse_answer(
            messages,
            scene,
            max_tokens=max_tokens,
            verse_span=verse_span,
        )
        if md and md.strip():
            return md

    nudge = (
        "\n\n请直接用 Markdown 输出成稿答案（含 ### 小节与 - 列表），"
        "不要输出思考过程，不要留空。"
    )
    base_msgs = [dict(m) for m in messages]
    if base_msgs and base_msgs[-1].get("role") == "user":
        base_msgs[-1] = {
            "role": "user",
            "content": str(base_msgs[-1].get("content") or "") + nudge,
        }

    for budget in (min(max_tokens, 900), min(max_tokens, 700)):
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
                md = normalize_answer_markdown(
                    md,
                    scene,
                    narrow=narrow,
                    verse_span=verse_span,
                )
                if md.strip():
                    return md
        text = normalize_answer_markdown(
            raw,
            scene,
            narrow=narrow,
            verse_span=verse_span,
        )
        if text.strip():
            return text
    return None
