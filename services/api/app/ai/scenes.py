"""小爱输出场景：统一契约，各入口只选 scene。"""
from __future__ import annotations

from dataclasses import dataclass

# 各场景正文结构（Markdown 三级标题 + 列表/表格）
_MD = (
    "使用标准 Markdown：小节用 ### 中文标题（如 ### 摘要），"
    "列表用 - 或 1. ，不要用【】包裹标题。"
)
# 方案 D：篇幅为建议值；要点未讲完须写完整，避免硬截断
_LEN_HINT = (
    "建议控制篇幅，但若各小节要点未讲完须写完整、句子收束自然，"
    "不要为凑短而省略关键内容，也不要中途截断。"
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
        max_tokens=768,
        wants_followups=False,
        format_guide=(
            f"{_MD}\n"
            "仅两级结构，不要表格、不要四级以下标题：\n"
            "### 摘要\n"
            "1 句（≤40 字），概括本节要旨。\n"
            "### 经文解释\n"
            "3–5 句，说清原意与关键词，口语自然，避免术语堆砌。\n"
            f"建议篇幅约 120–220 字。不要输出「相关追问」或「应用」。{_LEN_HINT}"
        ),
    ),
    "verse_full": SceneSpec(
        id="verse_full",
        mode="explain",
        label="综合解读",
        max_tokens=1200,
        wants_followups=False,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句（≤40 字）。\n"
            "### 背景\n"
            "2–4 句，交代历史与上下文。\n"
            "### 经文解释\n"
            "2–4 句，说清原意与关键词。\n"
            f"建议篇幅约 180–320 字。不要输出「相关追问」或「应用」。{_LEN_HINT}"
        ),
    ),
    "chat_explain": SceneSpec(
        id="chat_explain",
        mode="explain",
        label="释经解释",
        max_tokens=1024,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句（≤40 字）。\n"
            "### 背景\n"
            "1–3 句。\n"
            "### 经文解释\n"
            "2–4 句。\n"
            f"建议篇幅约 160–320 字。{_LEN_HINT}"
        ),
    ),
    "chat_understand": SceneSpec(
        id="chat_understand",
        mode="understand",
        label="理解默想",
        max_tokens=1024,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句。\n"
            "### 经文要旨\n"
            "2–4 句。\n"
            "### 默想引导\n"
            "1–3 句，温柔连接生命。\n"
            f"建议篇幅约 160–300 字。{_LEN_HINT}"
        ),
    ),
    "chat_apply": SceneSpec(
        id="chat_apply",
        mode="apply",
        label="生活应用",
        max_tokens=900,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句。\n"
            "### 核心提醒\n"
            "1–2 句。\n"
            "### 具体行动\n"
            "2–4 条，用 - 列表，贴近日常。\n"
            f"建议篇幅约 150–280 字。{_LEN_HINT}"
        ),
    ),
    "chat_study": SceneSpec(
        id="chat_study",
        mode="understand",
        label="预备查经",
        max_tokens=1400,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 经文分段\n"
            "2–4 个自然段，各 1 句概括（- 列表）。\n"
            "### 背景要点\n"
            "3–6 句。\n"
            "### 讨论问题\n"
            "6 个（观察 2、解释 2、应用 2），用 - 列表。\n"
            "### 带领提示\n"
            "2 条（- 列表）。\n"
            f"建议篇幅约 400–700 字。{_LEN_HINT}"
        ),
    ),
    "chat_preach": SceneSpec(
        id="chat_preach",
        mode="preach",
        label="讲道大纲",
        max_tokens=1400,
        wants_followups=False,
        format_guide=(
            f"{_MD}\n"
            "### 主题句\n"
            "1 句（15–25 字）。\n"
            "### 经文重述\n"
            "2–3 句。\n"
            "### 大纲\n"
            "3 个论点（每点：小标题 + 经文依据 + 展开 1–2 句，可用有序列表）。\n"
            "### 例证建议\n"
            "每点 1 个生活化方向（- 列表）。\n"
            "### 结论与回应\n"
            "1 个具体回应呼召。\n"
            f"不要输出「相关追问」。{_LEN_HINT}"
        ),
    ),
    "chat_compare": SceneSpec(
        id="chat_compare",
        mode="compare",
        label="译本对照",
        max_tokens=1400,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句。\n"
            "### 原文概览\n"
            "2–4 句：写出所选经文在希伯来文或希腊文中的整体表达"
            "（可音译关键短语），说明整句/短语的字面意思；"
            "不要逐词罗列 Strong 式词条或堆砌每个字的原文。\n"
            "### 译本差异\n"
            "用 Markdown 表格对比（列：译本 | 措辞 | 说明），1–3 行即可。\n"
            "### 理解建议\n"
            "2–4 句，综合原文与译本帮助读者把握准确含义。\n"
            f"建议篇幅约 200–400 字。{_LEN_HINT}"
        ),
    ),
    "chat_original": SceneSpec(
        id="chat_original",
        mode="compare",
        label="原文释义",
        max_tokens=1400,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句。\n"
            "### 原文概览\n"
            "2–4 句：写出所选经文在希伯来文或希腊文中的整体表达"
            "（可音译关键短语），说明整句/短语的字面意思；"
            "不要逐词罗列 Strong 式词条或堆砌每个字的原文。\n"
            "### 译本差异\n"
            "用 Markdown 表格对比（列：译本 | 措辞 | 说明），1–3 行即可。\n"
            "### 理解建议\n"
            "2–4 句，综合原文与译本帮助读者把握准确含义。\n"
            f"建议篇幅约 200–400 字。{_LEN_HINT}"
        ),
    ),
    "chat_general": SceneSpec(
        id="chat_general",
        mode="explain",
        label="主题问答",
        max_tokens=1100,
        wants_followups=True,
        format_guide=(
            f"{_MD}\n"
            "### 摘要\n"
            "1 句（≤40 字），直接点明问题的核心答案。\n"
            "### 正文\n"
            "2–4 个自然段，用清楚口语直接回答读者问题"
            "（人物生平按时间线、教义题按要点、历史题按事实链），"
            "不要套用「经文要旨」「默想引导」「经文解释」等面向单段经文的栏目。\n"
            "### 相关经节\n"
            "2–3 条（- 列表），格式「书卷名 章:节 — 为何值得读」。\n"
            f"建议篇幅约 200–420 字。{_LEN_HINT}"
        ),
    ),
    "summary_chapter": SceneSpec(
        id="summary_chapter",
        mode="explain",
        label="章导读",
        max_tokens=900,
        wants_followups=False,
        use_rag=False,
        format_guide=(
            f"{_MD}\n"
            "### 本章概览\n"
            "1 句（≤30 字），点明本章在主脉中的位置与要旨。\n"
            "### 核心内容\n"
            "2–4 条短句（- 列表），概括主要情节或教导要点。\n"
            f"建议篇幅约 80–150 字。适合读经前快读导读，通顺口语化。"
            f"不要输出「相关追问」。{_LEN_HINT}"
        ),
    ),
    "summary_book": SceneSpec(
        id="summary_book",
        mode="explain",
        label="卷导读",
        max_tokens=1200,
        wants_followups=False,
        use_rag=False,
        format_guide=(
            f"{_MD}\n"
            "### 卷概览\n"
            "1–2 句（≤60 字），点明整卷在圣经主脉中的位置与要旨。\n"
            "### 结构脉络\n"
            "3–4 段短段落（不用逐章罗列），按书卷自然结构划分（如创造—堕落—族长、"
            "出埃及—西奈—旷野等），每段 1–2 句说明该段主题与转折。\n"
            "### 核心主题\n"
            "3–4 条短句（- 列表），提炼整卷反复出现的神学主题或关键教导。\n"
            "### 读经提示\n"
            "1–2 句，点出 2–3 处重点段落或钥节（可标章節），帮助读者把握全书重心。\n"
            f"建议篇幅约 220–380 字。不要逐章概述，不要输出「相关追问」。"
            f"适合读经前快读导读，通顺口语化。{_LEN_HINT}"
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
