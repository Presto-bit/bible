"""ai perf_log 单测（无 DB 依赖）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.perf_log import record_ai_perf_marks  # noqa: E402


def test_record_ai_perf_marks_rejects_empty():
    out = record_ai_perf_marks(marks=[], device_id="dev-1")
    assert out["ok"] is False


def test_record_ai_perf_marks_rejects_invalid():
    out = record_ai_perf_marks(
        marks=[{"name": "", "ms": 10}, {"name": "x", "ms": -1}],
        device_id="dev-1",
    )
    assert out["ok"] is False
    assert out["error"] == "no_valid_marks"
