"""小爱输出场景：统一契约，各入口只选 scene。"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SceneSpec:
    id: str
    mode: str
    label: str
    max_tokens: int
    wants_followups: bool
    format_guide: str


SCENES: dict[str, SceneSpec] = {
    "verse_quick": SceneSpec(
        id="verse_quick",
        mode="explain",
        label="快读解释",
        max_tokens=512,
        wants_followups=False,
        format_guide=(
            "严格按以下结构输出（保留【】标题）：\n"
            "【摘要】1 句（≤40 字），概括本节要旨。\n"
            "【经文解释】3–5 句，说清原意与关键词，口语自然，避免术语堆砌。\n"
            "总篇幅 120–180 字。不要输出【相关追问】或【应用】。"
        ),
    ),
    "verse_full": SceneSpec(
        id="verse_full",
        mode="explain",
        label="综合解读",
        max_tokens=700,
        wants_followups=False,
        format_guide=(
            "严格按以下结构输出（保留【】标题）：\n"
            "【摘要】1 句（≤40 字）。\n"
            "【背景】2–4 句，交代历史与上下文。\n"
            "【经文解释】2–4 句，说清原意与关键词。\n"
            "总篇幅 180–280 字。不要输出【相关追问】或【应用】。"
        ),
    ),
    "chat_explain": SceneSpec(
        id="chat_explain",
        mode="explain",
        label="释经解释",
        max_tokens=900,
        wants_followups=True,
        format_guide=(
            "严格按以下结构输出（保留【】标题）：\n"
            "【摘要】1 句（≤40 字）。\n"
            "【背景】2–4 句。\n"
            "【经文解释】2–4 句。\n"
            "总篇幅 200–350 字。"
        ),
    ),
    "chat_understand": SceneSpec(
        id="chat_understand",
        mode="understand",
        label="理解默想",
        max_tokens=900,
        wants_followups=True,
        format_guide=(
            "【摘要】1 句。\n"
            "【经文要旨】2–4 句。\n"
            "【默想引导】2–3 句，温柔连接生命。\n"
            "总篇幅 200–350 字。"
        ),
    ),
    "chat_apply": SceneSpec(
        id="chat_apply",
        mode="apply",
        label="生活应用",
        max_tokens=900,
        wants_followups=True,
        format_guide=(
            "【摘要】1 句。\n"
            "【核心提醒】1–2 句。\n"
            "【具体行动】3 条（用 ①②③ 编号，职场/家庭/个人各至少一条）。\n"
            "【祷告方向】1 句简短引导。\n"
            "总篇幅 200–300 字。"
        ),
    ),
    "chat_study": SceneSpec(
        id="chat_study",
        mode="understand",
        label="预备查经",
        max_tokens=1200,
        wants_followups=True,
        format_guide=(
            "【经文分段】2–4 个自然段，各 1 句概括。\n"
            "【背景要点】3–5 句。\n"
            "【讨论问题】6 个（观察 2、解释 2、应用 2，用 - 列表）。\n"
            "【带领提示】2 条。\n"
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
            "【主题句】1 句（15–25 字）。\n"
            "【经文重述】2–3 句。\n"
            "【大纲】3 个论点（每点：小标题 + 经文依据 + 展开 1 句）。\n"
            "【例证建议】每点 1 个生活化方向。\n"
            "【结论与回应】1 个具体回应呼召。\n"
            "不要输出【相关追问】。"
        ),
    ),
    "chat_compare": SceneSpec(
        id="chat_compare",
        mode="compare",
        label="译本对照",
        max_tokens=900,
        wants_followups=True,
        format_guide=(
            "【摘要】1 句。\n"
            "【译本差异】和合本与 1–2 个常见译本的措辞差别。\n"
            "【差异原因】2–4 句。\n"
            "【理解建议】1–2 句。\n"
            "总篇幅 200–350 字。"
        ),
    ),
    "chat_original": SceneSpec(
        id="chat_original",
        mode="original",
        label="原文释义",
        max_tokens=900,
        wants_followups=True,
        format_guide=(
            "【摘要】1 句。\n"
            "【原文字词】2–3 个关键词（音译 + 基本义）。\n"
            "【语法与语境】3–5 句。\n"
            "【神学重点】1–2 句。\n"
            "总篇幅 200–350 字。"
        ),
    ),
    "summary_chapter": SceneSpec(
        id="summary_chapter",
        mode="explain",
        label="章导读",
        max_tokens=400,
        wants_followups=False,
        format_guide=(
            "用 80–120 字简体中文单段概括本章核心内容与要点，"
            "适合读经前导读，通顺自然，不要分条编号，不要【相关追问】。"
        ),
    ),
    "summary_book": SceneSpec(
        id="summary_book",
        mode="explain",
        label="卷导读",
        max_tokens=500,
        wants_followups=False,
        format_guide=(
            "用 150–200 字简体中文单段概括整卷主旨、结构与核心主题，"
            "适合读经前导读，通顺自然，不要分条编号，不要【相关追问】。"
        ),
    ),
}

# chip mode → scene（前端 chip 仍传 mode 时的兼容映射）
MODE_TO_SCENE: dict[str, str] = {
    "explain": "chat_explain",
    "understand": "chat_understand",
    "apply": "chat_apply",
    "compare": "chat_compare",
    "original": "chat_original",
    "preach": "chat_preach",
}


def resolve_scene(scene: str | None, mode: str) -> SceneSpec:
    if scene and scene in SCENES:
        return SCENES[scene]
    mapped = MODE_TO_SCENE.get(mode)
    if mapped and mapped in SCENES:
        return SCENES[mapped]
    return SCENES["chat_explain"]
