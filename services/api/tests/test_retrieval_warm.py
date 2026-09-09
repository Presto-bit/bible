"""retrieval prewarm 单测。"""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.retrieval_warm import warm_retrieval_for_ref  # noqa: E402


def test_warm_retrieval_noop_without_ref():
    warm_retrieval_for_ref(None)


def test_warm_retrieval_disabled_by_config():
    ref = SimpleNamespace(
        osis="JHN.3.16",
        book_name="约翰福音",
        book_id="JHN",
        chapter=3,
    )
    with patch("app.rag.retrieval_warm.get_settings") as mock_settings:
        mock_settings.return_value.rag_retrieval_prewarm_on_read = 0
        warm_retrieval_for_ref(ref)
