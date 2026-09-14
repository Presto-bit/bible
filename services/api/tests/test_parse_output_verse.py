from app.ai.parse_output import (
    answer_ends_abruptly,
    merge_continuation_sections,
    mid_bullet_truncated,
    missing_verse_sections,
    verse_explain_incomplete,
    verse_needs_length_continuation,
)


def _oia_body() -> str:
    return (
        "### 摘要\n神爱世人，甚至将独生子赐给他们，叫一切信他的，不至灭亡，反得永生。\n\n"
        "### 经文背景\n"
        "这一节把旧约「新心新灵」的盼望，连到约翰整卷「信而得生命」的主题，"
        "也与整本圣经救恩历史的线索相连。\n\n"
        "### 经文解释\n"
        "承接上文夜访对话，「重生」指由圣灵起头的新生命，而非再次物理出生；"
        "当初读者是受传统影响的犹太同胞，作者意在把救恩从行为转到信靠神的赐下。\n\n"
        "### 今日回应\n"
        "若你也在追问怎样才算够，可以先从承认需要被圣灵更新、信靠赐下的儿子开始。"
    )


def test_verse_full_oia_complete():
    body = _oia_body()
    assert len(body) >= 180
    assert not verse_explain_incomplete(
        "verse_full",
        body,
        depth="oia_compact",
        min_complete=180,
    )
    assert missing_verse_sections("verse_full", body) == []


def test_verse_full_missing_oia_sections():
    body = "### 摘要\n只有摘要。"
    assert verse_explain_incomplete("verse_full", body)
    missing = set(missing_verse_sections("verse_full", body))
    assert missing == {"经文解释", "经文背景", "今日回应"}


def test_verse_quick_oia_complete():
    body = _oia_body()
    assert not verse_explain_incomplete(
        "verse_quick",
        body,
        depth="oia_compact",
        min_complete=180,
    )
    assert not answer_ends_abruptly(body)


def test_oia_compact_short_incomplete():
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 经文解释\n当时指重生。\n"
    )
    assert verse_explain_incomplete(
        "verse_full",
        body,
        depth="oia_compact",
        min_complete=180,
    )


def test_oia_standard_complete():
    body = (
        "### 摘要\n神爱世人，甚至将独生子赐给他们，叫一切信他的，不至灭亡，反得永生。\n\n"
        "### 经文背景\n"
        "- 与约翰整卷「信而得生命」主题相连，亦呼应旧约新心之约的盼望。\n"
        "- 这一节把救恩历史的线索显明，指向神主动赐下的恩典。\n\n"
        "### 经文解释\n"
        "- 承接夜访对话，「重生」指由圣灵起头的新生命，而非再次物理出生。\n"
        "- 当初读者是受传统影响的犹太同胞；作者意在把救恩从行为转到信靠独生子。\n\n"
        "### 今日回应\n"
        "- 核心：救恩是礼物，始于信靠而非自我完善。\n"
        "- 今天可从诚实面对自己的需要、向神敞开开始。\n"
        "- 也可为仍在寻求的人代祷，温柔陪伴而非说教。"
    )
    assert len(body) >= 250
    assert not verse_explain_incomplete(
        "verse_full",
        body,
        depth="oia_standard",
        min_complete=250,
    )


def test_answer_ends_abruptly_detects_cut():
    body = "### 摘要\n说到一半就被"
    assert answer_ends_abruptly(body)
    assert not verse_needs_length_continuation("verse_full", body, finish_reason="stop")
    assert verse_needs_length_continuation("verse_full", body, finish_reason="length")


def test_missing_oia_sections_triggers_continuation():
    body = "### 摘要\n耶稣在旷野受试探，显明他顺服父的旨意。"
    assert verse_needs_length_continuation(
        "verse_full",
        body,
        verse_span=3,
        depth="oia_compact",
        expected_sections=("摘要", "经文背景", "经文解释", "今日回应"),
    )


def test_flash_chip_complete_with_summary_only():
    body = (
        "### 摘要\n"
        "神爱世人，甚至将他的独生子赐给他们，叫一切信他的，不至灭亡，反得永生。"
        "\n\n- 在同样语境下，救恩出于神的主动。\n"
        "- 「独生子」强调基督独特的位格。"
    )
    assert not verse_explain_incomplete(
        "verse_full",
        body,
        depth="flash",
        min_complete=60,
    )


def test_oia_alias_titles():
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 和上下文连\n与前后文连贯。\n\n"
        "### 经文解释\n当时指重生。\n\n"
        "### 生活应用\n今天可以祷告回应。"
    )
    assert missing_verse_sections("verse_full", body) == []


def test_mid_bullet_truncated_detects_ellipsis():
    body = "### 经文解释\n- 说到一半就被…"
    assert mid_bullet_truncated(body)
    assert verse_explain_incomplete("verse_full", body, depth="oia_deep")


def test_merge_duplicate_explain_sections_without_xu():
    body = (
        "### 摘要\n神爱世人。\n\n"
        "### 经文解释\n"
        "- 在尼哥底母夜访的语境下，这句话指向救恩出于神的主动。\n"
        "- 「独生子」强调基督独特的位格。\n\n"
        "### 经文解释\n"
        "- 在同样语境下，救恩出于神的主动赐予。\n"
        "- 信者得永生是整节要旨的收束。"
    )
    merged = merge_continuation_sections(body)
    assert merged.count("### 经文解释") == 1
    assert merged.count("- ") == 3
    assert "信者得永生" in merged


def test_dedupe_similar_bullets():
    from app.ai.parse_output import bullets_similar, dedupe_similar_bullets

    bullets = [
        "在尼哥底母夜访的语境下，这句话指向救恩出于神的主动。",
        "在同样语境下，救恩出于神的主动赐予。",
        "「独生子」强调基督独特的位格。",
    ]
    assert bullets_similar(bullets[0], bullets[1])
    assert len(dedupe_similar_bullets(bullets)) == 2
