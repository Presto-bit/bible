"""产品可见知识库：平台 + 其下专题文件夹 → source_types 映射（我的库暂缓）。"""
from __future__ import annotations

from typing import Any

# 平台默认检索类型（与历史 RAG_SOURCE_TYPES 对齐）
PLATFORM_SOURCE_TYPES = [
    "commentary",
    "reference-en",
    "study-bible-zh",
    "commentary-zh",
]

# 平台下的专题文件夹（浏览用）；选库时也可单选某一专题缩小检索范围
TOPIC_FOLDERS: list[dict[str, Any]] = [
    {
        "id": "zh-study",
        "name": "中文研经",
        "description": "中文研经与中文注释，便于直接阅读要点。",
        "source_types": ["study-bible-zh", "commentary-zh"],
        "is_default": False,
        "kind": "topic",
    },
    {
        "id": "en-commentary",
        "name": "公版英文注释",
        "description": "公版英文背景与经文注释，点开可看双语依据。",
        "source_types": ["commentary"],
        "is_default": False,
        "kind": "topic",
    },
    {
        "id": "reference",
        "name": "原文与词典",
        "description": "原文工具与参考词典类资料，适合查词与背景。",
        "source_types": ["reference-en"],
        "is_default": False,
        "kind": "topic",
    },
]

PLATFORM_KB: dict[str, Any] = {
    "id": "platform",
    "name": "平台知识库",
    "description": (
        "平台统一资料库，默认用于小爱检索。"
        "内含中文研经、公版英文注释、原文与词典三类文件夹；"
        "可选用全部，或只选其中一个文件夹缩小范围。"
    ),
    "source_types": list(PLATFORM_SOURCE_TYPES),
    "is_default": True,
    "kind": "platform",
}

KNOWLEDGE_BASES: list[dict[str, Any]] = [PLATFORM_KB, *TOPIC_FOLDERS]

_BY_ID = {kb["id"]: kb for kb in KNOWLEDGE_BASES}


def list_knowledge_bases() -> list[dict[str, Any]]:
    """选库列表：当前仅平台知识库（专题只作浏览文件夹）。"""
    return [
        {
            "id": PLATFORM_KB["id"],
            "name": PLATFORM_KB["name"],
            "description": PLATFORM_KB["description"],
            "is_default": True,
            "kind": "platform",
        }
    ]


def list_topic_folders() -> list[dict[str, Any]]:
    return [
        {
            "id": kb["id"],
            "name": kb["name"],
            "description": kb["description"],
            "kind": kb["kind"],
        }
        for kb in TOPIC_FOLDERS
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
