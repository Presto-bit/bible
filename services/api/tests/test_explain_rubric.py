from app.ai.explain_rubric import (
    explain_dimensions_missing,
    explain_fill_hint,
    explain_repeats_background,
)


def test_explain_dimensions_complete():
    body = (
        "### 经文背景\n当时背景。\n\n"
        "### 经文解释\n"
        "承接上文，「重生」指新生命；当初读者是犹太同胞，作者意在指向信靠。"
    )
    assert explain_dimensions_missing(body, depth="oia_standard") == []


def test_explain_dimensions_missing_compact():
    body = "### 经文解释\n当时指重生。"
    missing = explain_dimensions_missing(body, depth="oia_compact")
    assert "当时原意" in missing or "写作对象" in missing


def test_explain_repeats_background():
    dup = "这一节把旧约盼望连到约翰整卷主题并展开"
    body = f"### 经文背景\n{dup}。\n\n### 经文解释\n{dup}，并说明信者得生命。"
    assert explain_repeats_background(body)


def test_explain_fill_hint():
    hint = explain_fill_hint(["写作对象", "写作意图"])
    assert hint and "经文解释" in hint
