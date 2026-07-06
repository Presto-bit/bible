"""FHL 书卷表离线兜底测试。"""
from __future__ import annotations

import sys
import urllib.error
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from lib.fhl_books import _STATIC_BOOKS, fhl_books_source, load_fhl_books  # noqa: E402


def test_load_fhl_books_offline_static_fallback():
    import lib.fhl_books as mod

    mod._FHL_BOOKS = None
    mod._FHL_SOURCE = None
    with patch("lib.fhl_books._fetch_live", side_effect=urllib.error.URLError("network")):
        with patch("lib.fhl_books._load_cache", return_value=None):
            rows = load_fhl_books()
    assert len(rows) == 66
    assert fhl_books_source() == "static"
    assert rows[0][2] == "GEN"
    assert rows[-1][2] == "REV"
    assert len(_STATIC_BOOKS) == 66
