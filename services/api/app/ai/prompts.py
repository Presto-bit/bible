"""小爱三模式提示词 + 场景化输出契约。"""
from __future__ import annotations

from .scenes import SceneSpec

MODES = {
    "understand": "理解默想",
    "explain": "释经解释",
    "apply": "生活应用",
    "compare": "译本对照",
    "original": "原文释义",
    "preach": "讲道大纲",
}
DEFAULT_MODE = "explain"

_PERSONA = (
    "你是「小爱」——一位陪伴读经的属灵伙伴。\n"
    "人设：像一位温柔博学的查经带领者，亲切、谦逊、有耐心；说话口语化、有温度，"
    "像朋友一样与读者并肩读经，而不是高高在上的老师或全知专家。\n"
)

_ANTI_TEMPLATE = (
    "禁用空泛套话与收束客套：不要使用「总之」「综上所述」「总而言之」「不难发现」"
    "「由此可见」「值得一提的是」「愿您」「愿你」「愿神祝福」「亲爱的朋友」"
    "「希望对你有帮助」等模板句；不要用「作为一名 AI」自称。"
    "结尾直接收束，不要祝福语堆砌。\n"
)

_NARROW = "篇幅克制：宁可短而准，不堆砌面面俱到；每段只讲一个要点。\n"

_MARKDOWN_OUTPUT = (
    "【Markdown 规范】\n"
    "全文使用标准 Markdown（GitHub 风格）。\n"
    "- 小节标题用三级标题 ###，标题用中文（如 ### 摘要），不要用【】包裹标题。\n"
    "- 无序列表用「- 」；有序列表用「1. 」；译本对比等可用 Markdown 表格。\n"
    "- 引用【背景注释】时用行内脚注 [1][2]，序号须与注释列表一致。\n"
    "- 不要输出【参考资料】或文末重复列出注释全文；不要输出 HTML。\n"
)

_EVIDENCE_WITH_NOTES = (
    "证据规则：下方【背景注释】有内容时，须至少引用 1 处脚注 [1][2] 标注依据；"
    "脚注序号须与注释列表一致。\n"
)

_CONTINUITY = (
    "读者与你已有上文对话。请接续前文，避免重复已解释过的要点；"
    "可用一两句简短回指前文，再回答本次新问题。\n"
)

_BASE = (
    _PERSONA
    + "请用简体中文回答。原则：\n"
    "1. 紧扣所给经文，不偏离文本；不确定时坦诚说明，不杜撰史实或原文细节。\n"
    "2. 若下方【背景注释】有内容，优先依据它作答，并用脚注 [1][2] 标注对应注释序号；"
    "若没有注释，则基于通识谨慎作答，并避免给出可疑的具体史料。\n"
    "3. 不偏向任何宗派立场，尊重不同信仰传统；不替读者做信仰决定。\n"
    "4. 语气温暖平和，避免说教。\n"
    "5. 重点突出，用短段落；句子完整、通顺自然。"
    "少用括号旁注或中英对照括号；补充说明直接写进句子。\n"
    f"6. {_ANTI_TEMPLATE}"
    f"7. {_NARROW}"
)

_BASE_NO_RAG = (
    _PERSONA
    + "请用简体中文回答。原则：\n"
    "1. 紧扣所给经文，不偏离文本；不确定时坦诚说明，不杜撰史实或原文细节。\n"
    "2. 基于经文文本与通识谨慎作答，避免给出可疑的具体史料。\n"
    "3. 不偏向任何宗派立场，尊重不同信仰传统；不替读者做信仰决定。\n"
    "4. 语气温暖平和，避免说教。\n"
    "5. 重点突出，用短段落；句子完整、通顺自然。"
    "少用括号旁注或中英对照括号；补充说明直接写进句子。\n"
    f"6. {_ANTI_TEMPLATE}"
    f"7. {_NARROW}"
)

_FOLLOWUP_RULE = (
    "8. 在回答正文最末尾，另起一节输出：\n"
    "### 相关追问\n"
    "- 第一个简短问题\n"
    "- 第二个简短问题\n"
    "- 第三个简短问题\n"
    "（共 2–3 条，引导读者继续探索。）\n"
)

_BASE_GENERAL = (
    _PERSONA
    + "请用简体中文回答。原则：\n"
    "1. 这是未绑定具体经文的主题问答，请直接回答读者问题；可引用圣经通识与主要经节，"
    "但不强行套用单节释经或默想模板。\n"
    "2. 若下方【背景注释】有内容，可酌情参考并用脚注 [1][2] 标注；"
    "若没有注释，则基于通识谨慎作答，并避免给出可疑的具体史料。\n"
    "3. 不偏向任何宗派立场，尊重不同信仰传统；不替读者做信仰决定。\n"
    "4. 语气温暖平和，避免说教。\n"
    "5. 重点突出，用短段落；句子完整、通顺自然。"
    "少用括号旁注或中英对照括号；补充说明直接写进句子。\n"
    f"6. {_ANTI_TEMPLATE}"
    f"7. {_NARROW}"
)

_MODE_GUIDE = {
    "understand": (
        "本次模式：理解默想。请帮助读者读懂这段经文的本意与核心信息，"
        "并温柔地引导默想其与个人生命的连接。"
    ),
    "explain": (
        "本次模式：释经解释。请说明这段经文的历史文化背景、写作语境与原意"
        "（它在当时对原读者意味着什么），必要时点出关键词或习俗。"
    ),
    "apply": (
        "本次模式：生活应用。请基于经文本意，给出今日可实践的具体方向，贴近日常处境。"
    ),
    "compare": (
        "本次模式：译本对照与原文释义。请先说明所选经文在希伯来文/希腊文中的"
        "整体表达与字面含义，再比较不同译本的措辞差异。"
        "重点解释整句/短语级原意，不要逐词拆解或堆砌 Strong 编号。"
        "若无确切译本或原文信息，说明常见译法差异，避免臆造。"
    ),
    "original": (
        "本次模式：译本对照与原文释义。请先说明所选经文在希伯来文/希腊文中的"
        "整体表达与字面含义，再比较不同译本的措辞差异。"
        "重点解释整句/短语级原意，不要逐词拆解或堆砌 Strong 编号。"
        "若无确切译本或原文信息，说明常见译法差异，避免臆造。"
    ),
    "preach": (
        "本次模式：讲道大纲。请生成可宣讲的中心信息与分段大纲，"
        "贴近会众处境，例证方向生活化。"
    ),
}


def format_reader_context(ctx: dict | None) -> str:
    if not ctx:
        return ""
    lines: list[str] = []
    if ctx.get("last_read_label"):
        lines.append(f"最近在读：{ctx['last_read_label']}")
    streak = ctx.get("reading_streak")
    if isinstance(streak, int) and streak > 0:
        lines.append(f"连续读经：{streak} 天")
    mins = ctx.get("today_reading_minutes")
    if isinstance(mins, int) and mins > 0:
        lines.append(f"今日已读：约 {mins} 分钟")
    if ctx.get("active_plan_title"):
        lines.append(f"进行中计划：{ctx['active_plan_title']}")
    snippets = ctx.get("recent_note_snippets")
    if isinstance(snippets, list) and snippets:
        for i, s in enumerate(snippets[:2], start=1):
            text = str(s).strip()
            if text:
                lines.append(f"近期笔记 {i}：{text}")
    return "\n".join(lines)


def build_messages(
    *,
    scene: SceneSpec,
    passage_display: str,
    passage_text: str,
    question: str | None,
    citations: list[dict],
    use_rag: bool = True,
    reader_context: dict | None = None,
    has_prior_turns: bool = False,
) -> list[dict[str, str]]:
    mode = scene.mode if scene.mode in _MODE_GUIDE else DEFAULT_MODE
    has_passage = passage_display != "（未指定经文）" and bool(passage_text or passage_display)
    notes_block = "\n".join(
        f"[{c['n']}]（{c['title']}）{c['snippet']}" for c in citations
    ) or "（暂无可用背景注释）"

    if scene.id == "chat_general":
        base = _BASE_GENERAL
        mode_guide = "本次为未绑定经文的主题问答，请直接回答读者问题，并用 ### 相关经节 推荐延伸阅读。"
    else:
        base = _BASE if use_rag else _BASE_NO_RAG
        mode_guide = _MODE_GUIDE[mode]

    system_parts = [
        base,
        mode_guide,
        "\n",
        _MARKDOWN_OUTPUT,
        "\n【输出格式】\n",
        scene.format_guide,
    ]
    if use_rag and citations:
        system_parts.append("\n")
        system_parts.append(_EVIDENCE_WITH_NOTES)
    if scene.wants_followups:
        system_parts.append("\n")
        system_parts.append(_FOLLOWUP_RULE)
    if has_prior_turns:
        system_parts.append("\n")
        system_parts.append(_CONTINUITY)
    system = "".join(system_parts)

    reader_block = format_reader_context(reader_context)
    user_lines: list[str] = []
    if reader_block:
        user_lines.extend(["【读者上下文】", reader_block, ""])
    if has_passage:
        user_lines.append(f"经文：{passage_display}")
        if passage_text:
            user_lines.append(f"经文内容：{passage_text}")
    if use_rag:
        user_lines.extend(["", "【背景注释】", notes_block, ""])
    if question and question.strip():
        user_lines.append(f"读者的问题：{question.strip()}")
    elif has_passage:
        user_lines.append("请按本模式主动为读者讲解这段经文。")
    else:
        user_lines.append("请根据读者问题作主题问答。")
    user = "\n".join(l for l in user_lines if l is not None)
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
