"""兼容 re-export：社交模块历史 import 路径。"""
from __future__ import annotations

from ..content.moderation import (  # noqa: F401
    MAX_LEN,
    ModerationError,
    moderate_fields,
    moderate_sync_change,
    moderate_text,
)
