from app.ai.parse_output import (
    answer_ends_abruptly,
    merge_continuation_sections,
    mid_bullet_truncated,
    missing_verse_sections,
    verse_explain_incomplete,
    verse_needs_length_continuation,
)


def test_verse_full_complete():
    body = (
        "### 摘要\n神爱世人，甚至将独生子赐给他们。\n\n"
        "### 背景\n- 本节出现在约翰福音第三章，是耶稣与尼哥底母夜间的对话。\n\n"
        "### 经文解释\n"
        "- 「赐下」表明救恩出于神的主动。\n"
        "- 「独生子」指向基督独特的位格。"
    )
    assert len(body) >= 100
    assert not verse_explain_incomplete("verse_full", body)
    assert missing_verse_sections("verse_full", body) == []


def test_verse_full_missing_sections():
    body = "### 摘要\n只有摘要。"
    assert verse_explain_incomplete("verse_full", body)
    assert set(missing_verse_sections("verse_full", body)) == {"经文背景", "经文解释"}


def test_verse_quick_complete():
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 经文解释\n"
        "- 本节强调救恩出于神的主动赐予。\n"
        "- 「独生子」指向基督；信者得永生。"
    )
    assert not verse_explain_incomplete("verse_quick", body)
    assert not answer_ends_abruptly(body)


def test_verse_full_short_but_complete_not_incomplete():
    """小节齐全、自然收束的短答不应触发续写。"""
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 背景\n- 约翰福音第三章，耶稣与尼哥底母对话。\n\n"
        "### 经文解释\n"
        "- 强调神主动赐下独生子。\n"
        "- 信者得永生。"
    )
    assert not verse_explain_incomplete("verse_full", body)
    assert not verse_needs_length_continuation("verse_full", body, finish_reason="stop")


def test_verse_full_passage_span_thin_incomplete():
    body = (
        "### 摘要\n教会内不可互诉。\n\n"
        "### 经文解释\n- 只写一句。"
    )
    assert verse_explain_incomplete("verse_full", body, verse_span=11)
    assert set(missing_verse_sections("verse_full", body, verse_span=11)) == {
        "经文背景",
        "段落脉络",
    }


def test_verse_full_passage_span_complete_with_outline():
    body = (
        "### 摘要\n"
        "保罗劝哥林多教会不可在世俗法庭互诉，要活出与世有别、被洗净的见证。\n\n"
        "### 经文背景\n"
        "- 哥林多是港口商贸城，诉讼文化盛行，教会成员也受世俗风气影响。\n"
        "- 保罗在此纠正：圣徒纠纷应在教会内解决，而非羞辱见证。\n\n"
        "### 段落脉络\n"
        "- 1–6 节：弟兄互诉，暴露关系破裂与见证受损。\n"
        "- 7–8 节：为何不当在 unbelievers 面前争讼，反要接受教会内判断。\n"
        "- 9–11 节：恶行与神的国不相容；「你们中间也有人如此，如今却被洗净」。\n\n"
        "### 经文解释\n"
        "- 诉讼羞辱教会合一与见证，也反映对彼此缺乏信任与爱的操练。\n"
        "- 「你们要在 unbelievers 面前争讼吗」指向另一种解决冲突的方式。\n"
        "- 9–10 节清单不是贴标签定罪，而是提醒某些生活方式与承受神国不相容。\n"
        "- 11 节是整段钥匙：福音转变——我们也曾如此，如今却被洗净、称义、成圣。\n"
    )
    assert not verse_explain_incomplete("verse_full", body, verse_span=11)


def test_answer_ends_abruptly_detects_cut():
    body = "### 摘要\n说到一半就被"
    assert answer_ends_abruptly(body)
    assert not verse_needs_length_continuation("verse_full", body, finish_reason="stop")
    assert verse_needs_length_continuation("verse_full", body, finish_reason="length")


def test_length_not_continued_when_sections_complete():
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 背景\n- 约翰福音第三章。\n\n"
        "### 经文解释\n"
        "- 强调神主动赐下独生子。\n"
        "- 信者得永生。"
    )
    assert not verse_needs_length_continuation("verse_full", body, finish_reason="length")


def test_missing_sections_triggers_continuation():
    body = (
        "### 摘要\n"
        "耶稣在旷野受试探，显明他顺服父的旨意，也为我们胜过试探的软弱。"
    )
    assert verse_needs_length_continuation(
        "verse_full",
        body,
        verse_span=25,
        depth="standard",
        expected_sections=("摘要", "经文背景", "经文解释"),
    )


def test_flash_complete_with_summary_only():
    body = (
        "### 摘要\n"
        "神爱世人，甚至将他的独生子赐给他们，叫一切信他的，不至灭亡，反得永生。"
        "这是整节经文的核心信息，用白话概括即可。"
    )
    assert not verse_explain_incomplete(
        "verse_full",
        body,
        depth="flash",
        min_complete=60,
    )


def test_standard_span11_without_outline_not_incomplete_when_prose():
    body = (
        "### 摘要\n保罗劝哥林多教会不可互诉。\n\n"
        "### 经文背景\n"
        "哥林多是港口城，诉讼文化盛行，保罗在此纠正弟兄互诉的问题。\n\n"
        "### 经文解释\n"
        "诉讼暴露关系破裂与见证受损；保罗指向在教会内解决冲突的方式，"
        "并提醒福音转变：我们也曾如此，如今却被洗净、称义、成圣。"
    )
    assert not verse_explain_incomplete(
        "verse_full",
        body,
        verse_span=11,
        depth="standard",
        expected_sections=("摘要", "经文背景", "经文解释"),
        min_complete=120,
    )
    assert set(missing_verse_sections(
        "verse_full",
        body,
        verse_span=11,
        expected_sections=("摘要", "经文背景", "经文解释"),
    )) == set()


def test_mid_bullet_truncated_detects_ellipsis():
    body = "### 经文解释\n- 说到一半就被…"
    assert mid_bullet_truncated(body)
    assert verse_explain_incomplete("verse_full", body, depth="deep")


def test_merge_continuation_sections_merges_explain():
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 经文解释\n"
        "- 在尼哥底母夜访的语境下，这句话指向救恩出于神的主动。\n"
        "- 「独生子」强调基督独特的位格。\n\n"
        "### 经文解释（续）\n"
        "- 在同样语境下，「赐下」表明救恩是礼物而非酬劳。\n"
        "- 信者得永生是整节要旨的收束。"
    )
    merged = merge_continuation_sections(body)
    assert "（续）" not in merged
    assert merged.count("### 经文解释") == 1
    assert "礼物而非酬劳" in merged
    assert "救恩出于神的主动" in merged
