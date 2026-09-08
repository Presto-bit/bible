from app.ai.parse_output import (
    answer_ends_abruptly,
    missing_verse_sections,
    verse_explain_incomplete,
    verse_needs_length_continuation,
)


def test_verse_full_complete():
    body = (
        "### 摘要\n神爱世人，甚至将独生子赐给他们。\n\n"
        "### 背景\n本节出现在约翰福音第三章，是耶稣与尼哥底母夜间的对话，"
        "强调从上面重生才能见神的国。\n\n"
        "### 经文解释\n「赐下」表明救恩出于神的主动；"
        "「独生子」指向基督独特的位格；整节指向因信得永生的应许。"
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
        "### 经文解释\n本节强调救恩出于神的主动赐予；"
        "「独生子」指向基督；信者得永生，是整卷福音的核心信息之一。"
    )
    assert len(body) >= 60
    assert not verse_explain_incomplete("verse_quick", body)
    assert not answer_ends_abruptly(body)


def test_verse_full_short_but_complete_not_incomplete():
    """小节齐全、自然收束的短答不应触发续写。"""
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 背景\n约翰福音第三章，耶稣与尼哥底母对话。\n\n"
        "### 经文解释\n强调神主动赐下独生子，信者得永生。"
    )
    assert not verse_explain_incomplete("verse_full", body)
    assert not verse_needs_length_continuation("verse_full", body, finish_reason="stop")


def test_answer_ends_abruptly_detects_cut():
    body = "### 摘要\n说到一半就被"
    assert answer_ends_abruptly(body)
    assert verse_needs_length_continuation("verse_full", body, finish_reason="stop")
