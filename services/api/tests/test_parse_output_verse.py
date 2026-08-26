from app.ai.parse_output import (
    missing_verse_sections,
    verse_explain_incomplete,
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
