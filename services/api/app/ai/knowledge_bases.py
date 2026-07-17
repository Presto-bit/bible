"""产品可见知识库：平台 + 专题 → source_types 映射（我的库暂缓）。"""
from __future__ import annotations

from typing import Any

# 平台默认检索类型（与历史 RAG_SOURCE_TYPES 对齐）
PLATFORM_SOURCE_TYPES = [
    "commentary",
    "reference-en",
    "study-bible-zh",
    "commentary-zh",
]

# id → 配置；UI / API 只暴露这些
KNOWLEDGE_BASES: list[dict[str, Any]] = [
    {
        "id": "platform",
        "name": "平台知识库",
        "description": "公版注释、研经与词典等平台资料（默认）",
        "source_types": list(PLATFORM_SOURCE_TYPES),
        "is_default": True,
        "kind": "platform",
    },
    {
        "id": "zh-study",
        "name": "中文研经",
        "description": "中文自有研经与中文注释资料",
        "source_types": ["study-bible-zh", "commentary-zh"],
        "is_default": False,
        "kind": "topic",
    },
    {
        "id": "en-commentary",
        "name": "公版英文注释",
        "description": "公版英文背景注释",
        "source_types": ["commentary"],
        "is_default": False,
        "kind": "topic",
    },
    {
        "id": "reference",
        "name": "原文与词典",
        "description": "英文参考词典与原文工具类资料",
        "source_types": ["reference-en"],
        "is_default": False,
        "kind": "topic",
    },
]

_BY_ID = {kb["id"]: kb for kb in KNOWLEDGE_BASES}


def list_knowledge_bases() -> list[dict[str, Any]]:
    return [
        {
            "id": kb["id"],
            "name": kb["name"],
            "description": kb["description"],
            "is_default": kb["is_default"],
            "kind": kb["kind"],
        }
        for kb in KNOWLEDGE_BASES
    ]


def resolve_knowledge_base(kb_id: str | None) -> dict[str, Any]:
    """解析知识库；未知或空 → 平台默认。"""
    if kb_id and kb_id in _BY_ID:
        return _BY_ID[kb_id]
    return _BY_ID["platform"]


def source_types_for_kb(kb_id: str | None) -> list[str]:
    return list(resolve_knowledge_base(kb_id)["source_types"])


def get_knowledge_base(kb_id: str) -> dict[str, Any] | None:
    return _BY_ID.get(kb_id)
