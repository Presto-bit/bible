"""小爱三模式提示词 + 场景化输出契约。"""
from __future__ import annotations

from .scenes import SceneSpec, verse_scene_format_guide
from .depth_router import DepthProfile

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

_ANTI_REASONING = (
    "不要输出思考过程、推理步骤、内心独白或元话语"
    "（如「让我想想」「首先分析」「我需要先梳理」）；"
    "直接给出面向读者的成稿答案。\n"
)

_NARROW = (
    "篇幅与问题匹配：Chip 追问宜极精炼（2–3 条要点）；单节快读宜短；"
    "各小节用 - 列表写满要点即停，不要重复已说内容，也不要为凑字而啰嗦。\n"
)

_NARROW_FOLLOWUP = (
    "本次为短追问：请直接回应，结构为 ### 摘要（≤30 字）+ 2–3 条 - 要点；"
    "总篇幅约 120–180 字，不要背景铺垫，不要相关追问。\n"
)

_MARKDOWN_OUTPUT_SOFT = (
    "【Markdown 规范 · 快懂】\n"
    "- 先写 ### 摘要（1–2 句白话，≤50 字）。\n"
    "- 其后可用 1–2 个自然段补充要点；**不强制**列表与小标题。\n"
    "- 关键术语可加粗；引用经文可用 *斜体*。\n"
    "- 不要输出【参考资料】或 HTML；半屏不要「相关追问」。\n"
)

_MARKDOWN_OUTPUT = (
    "【Markdown 规范】\n"
    "全文使用标准 Markdown（GitHub 风格）。\n"
    "- 小节标题用三级标题 ###，标题用中文（如 ### 摘要），不要用【】包裹标题。\n"
    "- 结构顺序：**必须先写 ### 摘要（章/卷导读则用 ### 本章概览 或 ### 卷概览）**，"
    "写完整首句后再写其它小节。\n"
    "- **除摘要/概览外，各小节内容必须用 - 无序列表输出要点**（每条一句）；"
    "禁止连续超过 2 句的散文段。\n"
    "- 有序列表统一用「1. 」（不要用「1、」或圈号）。\n"
    "- 关键术语用 **加粗**；引用经文原文可用 *斜体* 或 > 引用块。\n"
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
    f"7. {_ANTI_REASONING}"
    f"8. {_NARROW}"
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
    f"7. {_ANTI_REASONING}"
    f"8. {_NARROW}"
)

_FOLLOWUP_RULE = (
    "8. 在回答正文最末尾，另起一节输出：\n"
    "### 相关追问\n"
    "- 第一个问题\n"
    "- 第二个问题\n"
    "- 第三个问题\n"
    "（共 2–3 条，供 Chip 展示：每条 12–24 字、一句问完、口语自然、意思完整；"
    "勿用「请/能否/可以」开头，勿写从句或背景铺垫。）\n"
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
    f"7. {_ANTI_REASONING}"
    f"8. {_NARROW}"
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
        "本次模式：译本对照（白话）。先用一句话说清这节在讲什么，"
        "再对比已提供的两本译本措辞差异（摘短句即可），"
        "然后用最多1～2个原文关键词帮助理解（中文意思优先，可附音译；不要堆 Strong 编号），"
        "最后给简短读经提示。不要大段抄写经文，不要用表格。"
        "若未提供译本正文，只谈常见译法差异，避免臆造引文。"
    ),
    "original": (
        "本次模式：译本对照（白话）。先用一句话说清这节在讲什么，"
        "再对比已提供的两本译本措辞差异（摘短句即可），"
        "然后用最多1～2个原文关键词帮助理解（中文意思优先，可附音译；不要堆 Strong 编号），"
        "最后给简短读经提示。不要大段抄写经文，不要用表格。"
        "若未提供译本正文，只谈常见译法差异，避免臆造引文。"
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
    versions = ctx.get("compare_versions")
    if isinstance(versions, list) and versions:
        lines.append("【可供对照的译本正文】（请据此比较，勿杜撰译本措辞）")
        for item in versions[:4]:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or item.get("version") or "译本").strip()
            text = str(item.get("text") or "").strip()
            if label and text:
                lines.append(f"{label}：{text}")
    return "\n".join(lines)


def depth_format_guide(profile: DepthProfile, scene_id: str, verse_span: int = 1) -> str:
    """R1：按 depth 选输出形态，覆盖 scene 默认教案式指引。"""
    if profile.depth == "flash":
        lo, hi = profile.target_chars - 40, profile.soft_max
        return (
            "【快懂模式】\n"
            f"先 ### 摘要（1–2 句，≤50 字），再用 1–2 段短白话说明「是什么意思、今天怎么理解」。"
            f"总篇幅约 {lo}–{hi} 字。\n"
            "不要展开历史考据；不要多个 ### 小节；不要列表堆砌；不要「相关追问」。"
        )
    if profile.depth == "study":
        return (
            "【教案模式】\n"
            "按给定小节用 ### 标题 + - 列表输出，便于导出与讨论；"
            "每条要点写完整句，避免标题式短语。"
        )
    if profile.section_policy == "soft" and profile.prefer_prose:
        titles = "、".join(f"### {t}" for t in profile.sections if t)
        return (
            f"【标准模式 · 轻结构】\n"
            f"小节：{titles or '摘要 + 正文'}。\n"
            "摘要宜短；其余可用短段落或少量列表，按内容自然选择，"
            "不要为凑结构而空泛分节。"
        )
    if scene_id in ("verse_full", "verse_quick"):
        return verse_scene_format_guide(scene_id, verse_span, depth=profile)
    return ""


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
    narrow: bool = False,
    verse_span: int = 1,
    depth: DepthProfile | None = None,
) -> list[dict[str, str]]:
    mode = scene.mode if scene.mode in _MODE_GUIDE else DEFAULT_MODE
    has_passage = passage_display != "（未指定经文）" and bool(passage_text or passage_display)
    notes_block = "\n".join(
        f"[{c['n']}]（{c['title']}）{c['snippet']}" for c in citations
    ) or "（暂无可用背景注释）"

    if scene.id == "chat_general":
        base = _BASE_GENERAL
        mode_guide = "本次为未绑定经文的主题问答，请直接回答读者问题，并用 ### 相关经节 推荐延伸阅读。"
    elif scene.id == "chat_viewpoints":
        base = _BASE if use_rag else _BASE_NO_RAG
        mode_guide = (
            "本次为「并列观点」模式：对争议或易分歧主题并列呈现主要理解与依据，"
            "不替读者做教义裁决；释义不等于圣经正文。"
        )
    else:
        base = _BASE if use_rag else _BASE_NO_RAG
        mode_guide = _MODE_GUIDE[mode]

    system_parts = [
        base,
        mode_guide,
        "\n",
    ]
    if depth and depth.prefer_prose:
        system_parts.append(_MARKDOWN_OUTPUT_SOFT)
    else:
        system_parts.append(_MARKDOWN_OUTPUT)
    system_parts.append("\n【输出格式】\n")
    depth_guide = depth_format_guide(depth, scene.id, verse_span) if depth else ""
    if depth_guide:
        system_parts.append(depth_guide)
    elif scene.id in ("verse_full", "verse_quick"):
        system_parts.append(verse_scene_format_guide(scene.id, verse_span))
    else:
        system_parts.append(scene.format_guide)
    if use_rag and citations:
        system_parts.append("\n")
        system_parts.append(_EVIDENCE_WITH_NOTES)
    if scene.wants_followups and not narrow:
        system_parts.append("\n")
        system_parts.append(_FOLLOWUP_RULE)
    if has_prior_turns:
        system_parts.append("\n")
        system_parts.append(_CONTINUITY)
    if narrow:
        system_parts.append("\n")
        system_parts.append(_NARROW_FOLLOWUP)
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
