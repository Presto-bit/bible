"""小爱输出场景：统一契约，各入口只选 scene。"""
from __future__ import annotations

from dataclasses import dataclass

# 各场景正文结构（Markdown 三级标题 + 列表/表格）
_MD = (
    "使用标准 Markdown：小节用 ### 中文标题（如 ### 摘要），"
    "列表用 - 或 1. ，不要用【】包裹标题。"
)


@dataclass(frozen=True)
class SceneSpec:
    id: str
    mode: str
    label: str
    max_tokens: int
    wants_followups: bool
    format_guide: str
    use_rag: bool = True


SCENES: dict[str, SceneSpec] = {
    "verse_quick": SceneSpec(
        id="verse_quick",
        mode="explain",
        label="快读解释",
        max_tokens=512,
        wants_followups=False,
        format_guide=(
            f"{_MD}\n"
            "仅两级结构，不要表格、不要四级以下标题：\n"
            "### 摘要\n"
            "1 句（≤40 字），概括本节要旨。\n"
            "### 经文解释\n"
            "3–5 句，说清原意与关键词，口语自然，避免术语堆砌。\n"
            "总篇幅 120–180 字。不要输出「相关追问」或「应用」。"
        ),
    ),
    "verse_full": SceneSpec(
        id="verse_full",
        mode="explain",
        label="综合解读",
        max_tokens=1024,
        wants_followups=False,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句（≤40 字）。\n"
            "### 背景\n"
            "2–4 句，交代历史与上下文。\n"
            "### 经文解释\n"
            "2–4 句，说清原意与关键词。\n"
            "总篇幅 180–280 字。不要输出「相关追问」或「应用」。"
        ),
    ),
    "chat_explain": SceneSpec(
        id="chat_explain",
        mode="explain",
        label="释经解释",
        max_tokens=768,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句（≤40 字）。\n"
            "### 背景\n"
            "1–3 句。\n"
            "### 经文解释\n"
            "2–3 句。\n"
            "总篇幅 160–280 字。"
        ),
    ),
    "chat_understand": SceneSpec(
        id="chat_understand",
        mode="understand",
        label="理解默想",
        max_tokens=768,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句。\n"
            "### 经文要旨\n"
            "2–3 句。\n"
            "### 默想引导\n"
            "1–2 句，温柔连接生命。\n"
            "总篇幅 160–260 字。"
        ),
    ),
    "chat_apply": SceneSpec(
        id="chat_apply",
        mode="apply",
        label="生活应用",
        max_tokens=700,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句。\n"
            "### 核心提醒\n"
            "1 句。\n"
            "### 具体行动\n"
            "2–3 条，用 - 列表，贴近日常。\n"
            "总篇幅 150–240 字。"
        ),
    ),
    "chat_study": SceneSpec(
        id="chat_study",
        mode="understand",
        label="预备查经",
        max_tokens=1200,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 经文分段\n"
            "2–4 个自然段，各 1 句概括（- 列表）。\n"
            "### 背景要点\n"
            "3–5 句。\n"
            "### 讨论问题\n"
            "6 个（观察 2、解释 2、应用 2），用 - 列表。\n"
            "### 带领提示\n"
            "2 条（- 列表）。\n"
            "总篇幅 400–600 字。"
        ),
    ),
    "chat_preach": SceneSpec(
        id="chat_preach",
        mode="preach",
        label="讲道大纲",
        max_tokens=1200,
        wants_followups=False,
        format_guide=(
            f"{_MD}\n"
            "### 主题句\n"
            "1 句（15–25 字）。\n"
            "### 经文重述\n"
            "2–3 句。\n"
            "### 大纲\n"
            "3 个论点（每点：小标题 + 经文依据 + 展开 1 句，可用有序列表）。\n"
            "### 例证建议\n"
            "每点 1 个生活化方向（- 列表）。\n"
            "### 结论与回应\n"
            "1 个具体回应呼召。\n"
            "不要输出「相关追问」。"
        ),
    ),
    "chat_compare": SceneSpec(
        id="chat_compare",
        mode="compare",
        label="译本对照",
        max_tokens=900,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句。\n"
            "### 原文概览\n"
            "2–3 句：写出所选经文在希伯来文或希腊文中的整体表达"
            "（可音译关键短语），说明整句/短语的字面意思；"
            "不要逐词罗列 Strong 式词条或堆砌每个字的原文。\n"
            "### 译本差异\n"
            "用 Markdown 表格对比（列：译本 | 措辞 | 说明），1–3 行即可。\n"
            "### 理解建议\n"
            "2–3 句，综合原文与译本帮助读者把握准确含义。\n"
            "总篇幅 200–350 字。"
        ),
    ),
    "chat_original": SceneSpec(
        id="chat_original",
        mode="compare",
        label="原文释义",
        max_tokens=900,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句。\n"
            "### 原文概览\n"
            "2–3 句：写出所选经文在希伯来文或希腊文中的整体表达"
            "（可音译关键短语），说明整句/短语的字面意思；"
            "不要逐词罗列 Strong 式词条或堆砌每个字的原文。\n"
            "### 译本差异\n"
            "用 Markdown 表格对比（列：译本 | 措辞 | 说明），1–3 行即可。\n"
            "### 理解建议\n"
            "2–3 句，综合原文与译本帮助读者把握准确含义。\n"
            "总篇幅 200–350 字。"
        ),
    ),
    "chat_general": SceneSpec(
        id="chat_general",
        mode="explain",
        label="主题问答",
        max_tokens=900,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句（≤40 字），直接点明问题的核心答案。\n"
            "### 正文\n"
            "2–3 个自然段，用清楚口语直接回答读者问题"
            "（人物生平按时间线、教义题按要点、历史题按事实链），"
            "不要套用「经文要旨」「默想引导」「经文解释」等面向单段经文的栏目。\n"
            "### 相关经节\n"
            "2–3 条（- 列表），格式「书卷名 章:节 — 为何值得读」。\n"
            "总篇幅 200–360 字。"
        ),
    ),
    "summary_chapter": SceneSpec(
        id="summary_chapter",
        mode="explain",
        label="章导读",
        max_tokens=400,
        wants_followups=False,
        use_rag=False,
        format_guide=(
            f"{_MD}\n"
            "### 本章概览\n"
            "1 句（≤30 字），点明本章在主脉中的位置与要旨。\n"
            "### 核心内容\n"
            "2–3 条短句（- 列表），概括主要情节或教导要点。\n"
            "总篇幅 80–120 字。适合读经前快读导读，通顺口语化。不要输出「相关追问」。"
        ),
    ),
    "summary_book": SceneSpec(
        id="summary_book",
        mode="explain",
        label="卷导读",
        max_tokens=1000,
        wants_followups=False,
        use_rag=False,
        format_guide=(
            f"{_MD}\n"
            "### 卷概览\n"
            "1–2 句（≤60 字），点明整卷在圣经主脉中的位置与要旨。\n"
            "### 核心内容\n"
            "4–5 条短句（- 列表），概括结构划分、核心主题与重点段落。\n"
            "### 各章概述\n"
            "逐章一行（- 列表），格式「第 N 章：」+ 12–18 字要点，覆盖本卷每一章；"
            "章节超过 30 章时，可将连续主题相近的章节合并为一段（如「第 1–11 章：…」），"
            "但仍须覆盖全卷，不可遗漏末尾章节。\n"
            "总篇幅 450–650 字（章节极多的书卷可至 800 字）。"
            "适合读经前导读，通顺口语化，务必写完整、不要中途截断。不要输出「相关追问」。"
        ),
    ),
}

# 指定 surface 时强制关闭 RAG（如首页 rail 预填，仅首问轻量作答）
NO_RAG_SURFACES: frozenset[str] = frozenset({"home_prefill"})
# 无经文锚点时，这些 scene 会降级为 chat_general
REF_BOUND_SCENES: frozenset[str] = frozenset(
    {
        "verse_quick",
        "verse_full",
        "chat_explain",
        "chat_understand",
        "chat_apply",
        "chat_study",
        "chat_preach",
        "chat_compare",
        "chat_original",
    }
)
MODE_TO_SCENE: dict[str, str] = {
    "explain": "chat_explain",
    "understand": "chat_understand",
    "apply": "chat_apply",
    "compare": "chat_compare",
    "original": "chat_original",
    "preach": "chat_preach",
}


def resolve_scene(scene: str | None, mode: str, *, has_ref: bool = True) -> SceneSpec:
    if not has_ref:
        if scene and scene in SCENES and scene not in REF_BOUND_SCENES:
            return SCENES[scene]
        return SCENES["chat_general"]
    if scene and scene in SCENES:
        return SCENES[scene]
    mapped = MODE_TO_SCENE.get(mode)
    if mapped and mapped in SCENES:
        return SCENES[mapped]
    return SCENES["chat_explain"]
