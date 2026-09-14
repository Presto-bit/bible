"""经文解释四维 rubric：背景/脉络/对象/意图 — 检测与补形提示。"""
from __future__ import annotations

import re

from .parse_output import _section_text

_EXPLAIN_AUDIENCE_RE = re.compile(
    r"原读者|最初读者|写给|对象|会众|门徒|以色列|教会|信徒|同胞|提阿非罗"
)
_EXPLAIN_INTENT_RE = re.compile(
    r"意在|要叫|目的是|为要|写作意图|作者想|整卷|要让他们|盼望|见证|劝|建立|纠正"
)
_EXPLAIN_CONTEXT_LINK_RE = re.compile(
    r"承接|上文|下文|语境|在这一|此处|接着|整个|之前|之后|位于|附近"
)
_EXPLAIN_LEXICAL_RE = re.compile(
    r"原意|关键字|用词|这句话|经句|指|意为|表示"
)


def explain_dimensions_missing(
    body_text: str,
    *,
    depth: str | None = None,
) -> list[str]:
    """解释节缺哪一维；空列表表示四维信号足够。"""
    chunk = _section_text(body_text, "经文解释")
    if not chunk:
        return ["经文解释"]
    missing: list[str] = []
    if not _EXPLAIN_CONTEXT_LINK_RE.search(chunk):
        missing.append("上下文衔接")
    if not _EXPLAIN_LEXICAL_RE.search(chunk):
        missing.append("当时原意")
    if not _EXPLAIN_AUDIENCE_RE.search(chunk):
        missing.append("写作对象")
    if not _EXPLAIN_INTENT_RE.search(chunk):
        missing.append("写作意图")
    if depth == "oia_compact":
        # 半屏：原意必达；对象/意图至少其一；衔接可并入一句
        if "当时原意" not in missing and (
            "写作对象" not in missing or "写作意图" not in missing
        ):
            return []
        out: list[str] = []
        if "当时原意" in missing:
            out.append("当时原意")
        if "写作对象" in missing and "写作意图" in missing:
            out.append("写作对象")
            out.append("写作意图")
        elif "写作对象" in missing:
            out.append("写作对象")
        elif "写作意图" in missing:
            out.append("写作意图")
        return out
    return missing


def _plain_prefix(text: str, n: int = 20) -> str:
    flat = re.sub(r"[\s\-•·，。；、：:!?.!?\"\"''（）()]", "", text)
    return flat[:n]


def explain_repeats_background(body_text: str) -> bool:
    """解释节是否与背景节高度重复（首句雷同）。"""
    bg = _section_text(body_text, "经文背景") or _section_text(body_text, "背景")
    expl = _section_text(body_text, "经文解释")
    if not bg or not expl:
        return False
    bg_pre = _plain_prefix(bg)
    expl_pre = _plain_prefix(expl)
    if len(bg_pre) < 12 or len(expl_pre) < 12:
        return False
    return bg_pre == expl_pre or (
        len(bg_pre) >= 12 and expl_pre.startswith(bg_pre)
    )


def explain_fill_hint(missing: list[str]) -> str | None:
    if not missing:
        return None
    dims = "、".join(missing)
    return (
        f"加厚 ### 经文解释：补 {dims}；"
        "承接背景勿重复，用「在……语境下」说明原意、原读者与作者意图"
    )
