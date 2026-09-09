"""response_profile 单测（R5 depth → study_sheet）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.response_profile import resolve_response_profile  # noqa: E402


def test_study_depth_uses_study_sheet():
    assert resolve_response_profile("verse_full", depth="study") == "study_sheet"
    assert resolve_response_profile("chat_explain", depth="study") == "study_sheet"


def test_chat_study_still_study_sheet():
    assert resolve_response_profile("chat_study") == "study_sheet"
