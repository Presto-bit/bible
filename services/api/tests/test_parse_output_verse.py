from app.ai.parse_output import (
    answer_ends_abruptly,
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
    assert set(missing_verse_sections("verse_full", body)) == {"背景", "经文解释"}


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
        "段落脉络",
    }


def test_verse_full_passage_span_complete_with_outline():
    body = (
        "### 摘要\n"
        "保罗劝哥林多教会不可在世俗法庭互诉，要活出与世有别、被洗净的见证。\n\n"
        "### 段落脉络\n"
        "- 诉讼问题：为何不可在不信者面前争讼，以免羞辱教会。\n"
        "- 伦理警告：恶行与神的国，列出不能承受国度的生活方式。\n"
        "- 福音转折：你们中间也有人如此，如今却被洗净、称义、成圣。\n\n"
        "### 经文解释\n"
        "- 诉讼羞辱教会合一与见证，也反映对彼此缺乏信任。\n"
        "- 恶行表列出不能承受神国的生活方式，提醒省察与悔改。\n"
        "- 清单不是给人定罪，而是呼召离开旧人旧习。\n"
        "- 「你们中间也有人如此」指向福音转变：曾被罪辖制，如今被洗净、称义、成圣。\n"
        "- 整段呼召教会以被赎身份活出新生命，而非凭旧习彼此伤害。\n"
    )
    assert not verse_explain_incomplete("verse_full", body, verse_span=7)


def test_answer_ends_abruptly_detects_cut():
    body = "### 摘要\n说到一半就被"
    assert answer_ends_abruptly(body)
    assert verse_needs_length_continuation("verse_full", body, finish_reason="stop")


def test_length_not_continued_when_sections_complete():
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 背景\n- 约翰福音第三章。\n\n"
        "### 经文解释\n"
        "- 强调神主动赐下独生子。\n"
        "- 信者得永生。"
    )
    assert not verse_needs_length_continuation("verse_full", body, finish_reason="length")
