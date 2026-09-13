"""小爱回答 Markdown 归一化：散文转 bullets、字段预算裁剪（R2 软收束）。"""
from __future__ import annotations

import re

from .answer_schema import (
    OIA_SECTIONS,
    PROSE_SECTION_TITLES,
    SUMMARY_LEAD_TITLES,
    budget_for_scene,
    canonical_oia_title,
    effective_budget_for_scene,
    section_bullet_cap,
)
from .parse_output import (
    FOLLOWUP_SECTION_RE,
    SECTION_MD_RE,
    bullets_similar,
    dedupe_similar_bullets,
    merge_continuation_sections,
    split_body_and_followups,
)

_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)、])\s+\S")
# LLM 偶发复述系统 prompt 内部标签，展示前剥离
_PROMPT_LEAK_RE = re.compile(
    r"^[ \t]*(?:【(?:快懂模式|教案模式|标准模式[^】]*)】|【Markdown 规范[^】]*】)\s*\n?",
    re.MULTILINE,
)
_PROMPT_LEAK_MD_RE = re.compile(
    r"^[ \t]*###\s*(?:快懂模式|教案模式|标准模式[^\n]*)\s*\n?",
    re.MULTILINE,
)


def strip_prompt_leakage(text: str) -> str:
    s = _PROMPT_LEAK_RE.sub("", text)
    return _PROMPT_LEAK_MD_RE.sub("", s).strip()
_SENTENCE_SPLIT = re.compile(r"(?<=[。！？])")
_SENTENCE_END = "。！？）」』》】"


_SUMMARY_BROKEN_MISUNDERSTANDING = re.compile(r"^.{0,3}一个误解")
_SUMMARY_FRAGMENT_START = re.compile(
    r"^(?:.{1,2}的(?:比喻|说明|意思|重点|主题|信息)|(?:比喻|说明|重点|主题|意思))"
)


def _summary_needs_repair(s: str) -> bool:
    t = s.strip()
    if not t:
        return True
    if t[-1] not in _SENTENCE_END:
        return True
    if _SUMMARY_BROKEN_MISUNDERSTANDING.match(t):
        return True
    if _SUMMARY_FRAGMENT_START.match(t):
        return True
    return False


def _sanitize_summary_lead(text: str) -> str:
    """修正 LLM 偶发的残缺起笔（如「住一个误解」「婚的比喻说明」）。"""
    s = text.strip().lstrip("-*• ")
    if _SUMMARY_BROKEN_MISUNDERSTANDING.match(s):
        rest = re.sub(r"^.{0,3}一个误解[，,、：:\s]*", "", s).strip()
        if rest:
            s = f"这节经文回应一个常见误解：{rest.lstrip('，,、：: ')}"
    frag = re.match(r"^(.{1,2})的(比喻|说明|意思|重点|主题|信息)(.*)$", s)
    if frag:
        head, kind, rest = frag.group(1), frag.group(2), frag.group(3)
        if head == "婚":
            s = f"这节经文以婚姻的{kind}{rest}"
        else:
            s = f"这节经文以{head}的{kind}{rest}"
    elif re.match(r"^(比喻|说明|重点|主题|意思)", s):
        s = f"这节经文{s}"
    if s and s[-1] not in _SENTENCE_END and len(s) >= 12:
        s = s.rstrip("，,、；;：: ") + "。"
    return s


def _trim_summary_sentence(text: str, limit: int) -> str:
    """摘要须完整可读：优先保留整句，避免硬切到一半。"""
    s = _sanitize_summary_lead(text.strip())
    soft = limit + 24
    if len(s) <= soft:
        return s
    sents = _split_sentences(s)
    if sents:
        out = ""
        for sent in sents:
            if not out:
                out = sent
                continue
            if len(out) + len(sent) <= soft:
                out += sent
            else:
                break
        if out and len(out) >= min(limit // 2, 28):
            return out
    return _trim_chars(s, limit, hard=False)


def _trim_chars(text: str, limit: int, *, hard: bool = False) -> str:
    """R2：默认软裁剪——仅当超过 2×limit 才截断。"""
    s = text.strip()
    cap = limit if hard else max(limit * 2, limit + 40)
    if len(s) <= cap:
        return s
    cut = s[:limit]
    for i in range(len(cut) - 1, max(8, len(cut) - 12), -1):
        if cut[i] in "，、；。！？":
            return cut[: i + 1 if cut[i] in "。！？" else i].rstrip("，、；") + "…"
    return cut.rstrip("，,、；; ") + "…"


def _split_sentences(chunk: str) -> list[str]:
    parts = [p.strip() for p in _SENTENCE_SPLIT.split(chunk.strip()) if p.strip()]
    if parts:
        return parts
    line = chunk.strip()
    return [line] if line else []


_OIA_EMIT_ORDER = (*OIA_SECTIONS[:2], "段落脉络", *OIA_SECTIONS[2:], "补充说明")


def _reorder_oia_markdown(body: str) -> str:
    """OIA 输出统一为：摘要 → 经文背景 → [段落脉络] → 经文解释 → 今日回应。"""
    raw_chunks = _section_chunks(body)
    if not raw_chunks:
        return body
    merged: dict[str, str] = {}
    preamble = ""
    for title, chunk in raw_chunks:
        if not title:
            if chunk.strip():
                preamble = chunk.strip()
            continue
        canon = canonical_oia_title(title)
        piece = chunk.strip()
        if canon in merged and piece:
            prior = merged[canon]
            if bullets_similar(
                piece.replace("\n", " "),
                prior.replace("\n", " "),
            ):
                continue
            merged[canon] = f"{prior}\n\n{piece}".strip()
        elif piece or canon not in merged:
            merged[canon] = piece if piece else merged.get(canon, "")
    out_parts: list[str] = []
    if preamble:
        out_parts.extend([preamble, ""])
    seen: set[str] = set()
    for title in _OIA_EMIT_ORDER:
        if title not in merged:
            continue
        content = merged[title].strip()
        if not content:
            continue
        seen.add(title)
        out_parts.extend([f"### {title}", content, ""])
    for title, content in merged.items():
        if title in seen:
            continue
        content = content.strip()
        if not content:
            continue
        out_parts.extend([f"### {title}", content, ""])
    return "\n".join(out_parts).strip()


def _section_chunks(body: str) -> list[tuple[str, str]]:
    """按 ### 切分 (title, content)。"""
    matches = list(SECTION_MD_RE.finditer(body))
    if not matches:
        return [("", body.strip())] if body.strip() else []
    out: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        if title == "相关追问":
            break
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        out.append((title, body[start:end].strip()))
    return out


def _chunk_to_bullets(
    chunk: str,
    item_max: int,
    max_items: int,
    *,
    format_only: bool = False,
    against: list[str] | None = None,
) -> list[str]:
    lines = [ln.strip() for ln in chunk.split("\n") if ln.strip()]
    bullets: list[str] = []
    for ln in lines:
        if _BULLET_RE.match(ln):
            item = re.sub(r"^\s*(?:[-*•]|\d+[.)、])\s+", "", ln).strip()
            if item:
                bullets.append(item if format_only else _trim_chars(item, item_max))
        elif bullets and not _BULLET_RE.match(ln):
            merged = bullets[-1] + ln
            bullets[-1] = merged if format_only else _trim_chars(merged, item_max)
    if bullets:
        return _finalize_bullets(
            bullets,
            item_max=item_max,
            max_items=max_items,
            format_only=format_only,
            against=against,
        )
    if format_only:
        return lines[:max_items]
    prose = " ".join(lines)
    for sent in _split_sentences(prose):
        bullets.append(_trim_chars(sent, item_max))
        if len(bullets) >= max_items * 2:
            break
    return _finalize_bullets(
        bullets,
        item_max=item_max,
        max_items=max_items,
        format_only=format_only,
        against=against,
    )


def _section_allows_prose(title: str) -> bool:
    if title in PROSE_SECTION_TITLES:
        return True
    return title.startswith("观点 ")


def _keep_section_prose(
    title: str,
    *,
    depth: str | None,
    prefer_prose: bool,
) -> bool:
    if title in SUMMARY_LEAD_TITLES or title in {"一句话", "主题", "补充说明"}:
        if depth in ("oia_compact", "oia_standard", "oia_deep", "flash"):
            return True
        return False
    if _section_allows_prose(title):
        return True
    if depth in ("flash", "oia_compact") or prefer_prose:
        return True
    if depth == "standard" and prefer_prose:
        return True
    return False


def is_prose_wall(body_text: str, scene: str) -> bool:
    """应 bullets 却写成散文墙（R2：study/deep 才强转）。"""
    bullet_scenes = {
        "verse_full",
        "verse_quick",
        "chat_explain",
        "chat_understand",
        "chat_apply",
        "summary_chapter",
        "summary_chapter_outline",
    }
    if scene not in bullet_scenes:
        return False
    for title, chunk in _section_chunks(body_text):
        if not title or title in SUMMARY_LEAD_TITLES or _section_allows_prose(title):
            continue
        if not chunk:
            continue
        lines = [ln for ln in chunk.split("\n") if ln.strip()]
        bullet_lines = sum(1 for ln in lines if _BULLET_RE.match(ln))
        if bullet_lines == 0 and len(chunk) > 80:
            return True
        if bullet_lines == 0 and len(lines) >= 2:
            return True
    return False


def _section_max_bullets(
    title: str,
    default_max: int,
    scene: str,
    verse_span: int,
) -> int:
    if scene in ("verse_full", "verse_quick"):
        cap = section_bullet_cap(title, verse_span)
        if cap is not None:
            return cap
    return default_max


def _bullet_complete(text: str) -> bool:
    item = text.strip()
    if not item or item.endswith("…") or item.endswith("..."):
        return False
    return item[-1] in _SENTENCE_END


def _trim_incomplete_bullets(bullets: list[str]) -> list[str]:
    out = list(bullets)
    while out and not _bullet_complete(out[-1]):
        out.pop()
    return out


def _consolidate_short_bullets(bullets: list[str], max_items: int) -> list[str]:
    """合并过碎、过短的要点，避免为凑字数拆条。"""
    if len(bullets) <= max_items:
        avg = sum(len(b) for b in bullets) / len(bullets) if bullets else 0
        if len(bullets) < 5 or avg >= 38:
            return bullets
    merged: list[str] = []
    buf = ""
    for b in bullets:
        if len(b) >= 38:
            if buf:
                merged.append(buf)
                buf = ""
            merged.append(b)
        elif buf:
            buf = f"{buf}；{b}" if buf else b
        else:
            buf = b
    if buf:
        merged.append(buf)
    if len(merged) <= max_items:
        return merged
    kept = merged[: max_items - 1]
    kept.append("；".join(merged[max_items - 1 :]))
    return kept


def _finalize_bullets(
    bullets: list[str],
    *,
    item_max: int,
    max_items: int,
    format_only: bool,
    against: list[str] | None = None,
) -> list[str]:
    cleaned = _trim_incomplete_bullets(bullets)
    cleaned = dedupe_similar_bullets(cleaned, against=against)
    cleaned = _consolidate_short_bullets(cleaned, max_items)
    if len(cleaned) > max_items:
        kept = cleaned[: max_items - 1]
        kept.append("；".join(cleaned[max_items - 1 :]))
        cleaned = kept
    out: list[str] = []
    for b in cleaned[:max_items]:
        out.append(b if format_only else _trim_chars(b, item_max))
    return out


def _trim_incomplete_tail_bullet(parts: list[str]) -> bool:
    """仅移除末尾未收束的 bullet（句中截断），保留完整要点。"""
    for i in range(len(parts) - 1, -1, -1):
        line = parts[i]
        if not line.startswith("- "):
            continue
        item = line[2:].strip()
        if not item:
            parts.pop(i)
            if i < len(parts) and parts[i] == "":
                parts.pop(i)
            return True
        if item.endswith("…") or item.endswith("..."):
            parts.pop(i)
            if i < len(parts) and parts[i] == "":
                parts.pop(i)
            return True
        if item and item[-1] not in _SENTENCE_END:
            parts.pop(i)
            if i < len(parts) and parts[i] == "":
                parts.pop(i)
            return True
        return False
    return False


def answer_over_budget(body_text: str, scene: str, *, narrow: bool = False, verse_span: int = 1) -> bool:
    bud = effective_budget_for_scene(scene, narrow=narrow, verse_span=verse_span)
    if not bud:
        return False
    return len(body_text.strip()) > bud.total_chars + 40


def normalize_answer_markdown(
    text: str,
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
    depth: str | None = None,
    soft_max: int | None = None,
    prefer_prose: bool = False,
    format_only: bool = False,
) -> str:
    """归一化为 ### + bullets/prose Markdown。

    format_only=True（R3）：fill 后只整理标题/列表形态，不做字数裁剪。
    """
    text = strip_prompt_leakage(text)
    text = merge_continuation_sections(text)
    body, followups = split_body_and_followups(text)
    bud = effective_budget_for_scene(scene, narrow=narrow, verse_span=verse_span)
    if not bud or not body.strip():
        return text

    if format_only:
        prefer_prose = True

    max_bullets = bud.max_bullets
    prior_section_bullets: list[str] = []
    prior_section_texts: list[str] = []
    oia_depth = depth in ("oia_compact", "oia_standard", "oia_deep")

    parts: list[str] = []
    for title, chunk in _section_chunks(body):
        if not title:
            if chunk:
                parts.append(chunk)
            continue
        title = canonical_oia_title(title)
        parts.append(f"### {title}")
        if title in SUMMARY_LEAD_TITLES or title in {"一句话", "主题", "补充说明"}:
            lead = chunk.replace("\n", " ").strip()
            if lead.startswith("- "):
                lead = lead[2:].strip()
            if format_only:
                trimmed = lead
            elif _keep_section_prose(title, depth=depth, prefer_prose=prefer_prose):
                trimmed = _trim_summary_sentence(lead, bud.summary_max)
            else:
                trimmed = _trim_chars(lead, bud.summary_max)
            if _keep_section_prose(title, depth=depth, prefer_prose=prefer_prose):
                parts.append(trimmed if trimmed else "")
            else:
                parts.append(f"- {trimmed}" if trimmed else "")
            parts.append("")
            if trimmed and oia_depth:
                prior_section_texts.extend(_split_sentences(trimmed))
            continue
        if format_only or _keep_section_prose(title, depth=depth, prefer_prose=prefer_prose):
            prose = chunk.replace("\n\n", "\n").strip()
            if not format_only and len(prose) > bud.item_max * (6 if depth == "flash" else 4):
                prose = _trim_chars(prose, bud.item_max * (6 if depth == "flash" else 4))
            parts.append(prose)
            parts.append("")
            if oia_depth and prose:
                prior_section_texts.extend(_split_sentences(prose.replace("\n", " ")))
            continue
        against: list[str] | None = None
        if oia_depth and title in ("经文解释", "经文背景", "今日回应"):
            against = list(prior_section_texts)
        elif title in ("经文解释",) and prior_section_bullets:
            against = prior_section_bullets
        bullets = _chunk_to_bullets(
            chunk,
            bud.item_max,
            _section_max_bullets(title, max_bullets, scene, verse_span),
            format_only=format_only,
            against=against,
        )
        if not bullets and chunk.strip():
            raw = chunk.replace("\n", " ").strip()
            bullets = [raw if format_only else _trim_chars(raw, bud.item_max)]
        if title in ("经文背景", "背景", "段落脉络"):
            prior_section_bullets.extend(bullets)
        for b in bullets:
            parts.append(f"- {b}")
        parts.append("")
        if oia_depth:
            prior_section_texts.extend(bullets)
            if chunk.strip() and not bullets:
                prior_section_texts.extend(_split_sentences(chunk.replace("\n", " ")))

    normalized_body = "\n".join(parts).strip()
    if oia_depth:
        normalized_body = _reorder_oia_markdown(normalized_body)
        normalized_body = merge_continuation_sections(normalized_body)
    if not format_only:
        hard_cap: int | None = None
        if depth == "flash":
            hard_cap = soft_max or (bud.total_chars + 80)
        elif depth in ("standard", "deep") and soft_max:
            hard_cap = soft_max + (80 if depth == "deep" else 120)
        elif depth == "study":
            base = budget_for_scene(scene, narrow=narrow)
            hard_cap = (soft_max or (base.total_chars if base else bud.total_chars)) + 160
        elif soft_max:
            hard_cap = soft_max + 80

        if hard_cap and len(normalized_body) > hard_cap:
            if depth in ("flash", "standard", None):
                pass
            else:
                while len(normalized_body) > hard_cap and _trim_incomplete_tail_bullet(parts):
                    normalized_body = "\n".join(parts).strip()

    if followups:
        normalized_body += "\n\n### 相关追问\n"
        normalized_body += "\n".join(f"- {q}" for q in followups)
    return normalized_body.strip()
