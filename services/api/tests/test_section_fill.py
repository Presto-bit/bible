"""section_fill 单测（P2 单次补形）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.section_fill import (  # noqa: E402
    collect_section_fill_hints,
    needs_section_fill,
)


def test_collect_hints_missing_verse_sections():
    body = "### 摘要\n只有摘要。"
    hints = collect_section_fill_hints(body, "verse_full", verse_span=11)
    assert any("经文背景" in h for h in hints)
    assert any("段落脉络" in h for h in hints)


def test_needs_section_fill_prose():
    body = "这是一大段没有任何小标题的散文解释" * 8
    assert needs_section_fill(body, "chat_explain")


def test_no_fill_when_complete():
    body = (
        "### 摘要\n摘要。\n\n"
        "### 经文背景\n- 背景一。\n\n"
        "### 经文解释\n- 解释一。\n- 解释二。\n- 解释三。\n"
    )
    hints = collect_section_fill_hints(body, "verse_quick", verse_span=1)
    assert hints == []
