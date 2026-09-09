"""prewarm 限流单测。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.prewarm_limit import _hits, allow_prewarm  # noqa: PLC2701


def test_allow_prewarm_requires_device_id():
    assert allow_prewarm(None) is False
    assert allow_prewarm("") is False


def test_allow_prewarm_window():
    _hits.clear()
    did = "test-device-prewarm"
    for _ in range(30):
        assert allow_prewarm(did) is True
    assert allow_prewarm(did) is False
    _hits.clear()
