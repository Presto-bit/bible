"""产品可见知识库：平台 + 其下专题文件夹 → source_types 映射（我的库暂缓）。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

# 平台默认检索类型（与历史 RAG_SOURCE_TYPES 对齐）
PLATFORM_SOURCE_TYPES = [
    "commentary",
    "reference-en",
    "study-bible-zh",
    "commentary-zh",
]

# 公版英文注释二级分类（按 HelloAO / 文件名前缀）
COMMENTARY_GROUPS: list[tuple[str, str]] = [
    ("matthew-henry", "Matthew Henry 注释"),
    ("jamieson-fausset-brown", "Jamieson–Fausset–Brown 注释"),
    ("keil-delitzsch", "Keil & Delitzsch 注释"),
    ("adam-clarke", "Adam Clarke 注释"),
    ("john-gill", "John Gill 注释"),
    ("tyndale", "Tyndale 注释"),
]

_COMMENTARY_GROUP_LABELS = {k: v for k, v in COMMENTARY_GROUPS}
_COMMENTARY_GROUP_ORDER = {k: i for i, (k, _) in enumerate(COMMENTARY_GROUPS)}

# 平台下的专题文件夹（浏览用）
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
        "description": "公版英文背景与经文注释，按注释系列再分子文件夹。",
        "source_types": ["commentary"],
        "is_default": False,
        "kind": "topic",
        "has_subfolders": True,
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
        "平台统一资料库，供小爱检索出处。"
        "当前按三类整理：中文研经、公版英文注释（如 Matthew Henry、Tyndale 等）、"
        "原文与词典；入库文件以 Markdown 注释/词典正文为主，检索时引用片段并标注来源。"
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
            "has_subfolders": bool(kb.get("has_subfolders")),
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


def commentary_group_id(source_path: str | None, title: str | None = None) -> str:
    """公版英文注释二级分组 id（文件名前缀 / 路径）。"""
    stem = Path(source_path or "").stem.lower()
    name = (title or "").lower()
    for gid, _ in COMMENTARY_GROUPS:
        if stem == gid or stem.startswith(f"{gid}-") or gid in stem:
            return gid
        if gid.replace("-", " ") in name or gid in name:
            return gid
    return "other"


def commentary_group_label(group_id: str) -> str:
    if group_id == "other":
        return "其他公版注释"
    return _COMMENTARY_GROUP_LABELS.get(group_id, group_id)


def commentary_group_sort_key(group_id: str) -> tuple[int, str]:
    if group_id == "other":
        return (999, group_id)
    return (_COMMENTARY_GROUP_ORDER.get(group_id, 100), group_id)


def build_platform_description(*, total_docs: int, folder_stats: list[dict[str, Any]]) -> str:
    """平台简介：文件情况 + 参考资料说明。"""
    parts = []
    for f in folder_stats:
        n = int(f.get("document_count") or 0)
        parts.append(f"{f.get('name')} {n} 份")
    breakdown = "；".join(parts) if parts else "暂无入库文件"
    refs = (
        "公版英文注释以 Matthew Henry、Tyndale 等公开注释系列为主；"
        "中文研经为中文注释与研经资料；原文与词典含英文参考词典与工具类正文。"
    )
    return (
        f"平台知识库当前共入库约 {total_docs} 份资料（{breakdown}）。"
        f"{refs}"
        "小爱回答时检索这些文件的片段作为出处；点开脚标可查看双语依据。"
    )


_PREVIEW_SUFFIX = {".md", ".txt", ".markdown"}
_PREVIEW_MAX_CHARS = 500_000


def resolve_document_source_file(source_path: str | None) -> Path | None:
    """将 DB source_path 解析为仓库内可读文本文件；拒绝越界路径。"""
    from ..config import REPO_ROOT
    from ..rag.paths import commentary_root, normalize_source_path

    if not (source_path or "").strip():
        return None
    raw = normalize_source_path(source_path.strip())
    try:
        resolved = Path(raw).resolve()
    except OSError:
        return None
    if not resolved.is_file():
        return None
    if resolved.suffix.lower() not in _PREVIEW_SUFFIX:
        return None
    roots = []
    for root in (REPO_ROOT, commentary_root()):
        try:
            roots.append(root.resolve())
        except OSError:
            continue
    for root in roots:
        try:
            resolved.relative_to(root)
            return resolved
        except ValueError:
            continue
    return None


def read_document_source_text(source_path: str | None) -> dict[str, Any]:
    """读取资料原文（非 RAG chunk）。返回 content / truncated / error / size_bytes。"""
    path = resolve_document_source_file(source_path)
    if not path:
        return {
            "content": None,
            "truncated": False,
            "size_bytes": None,
            "error": "源文件不存在或不可预览",
        }
    try:
        size = path.stat().st_size
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {
            "content": None,
            "truncated": False,
            "size_bytes": None,
            "error": "文件须为 UTF-8 文本",
        }
    except OSError:
        return {
            "content": None,
            "truncated": False,
            "size_bytes": None,
            "error": "无法读取源文件",
        }
    truncated = len(text) > _PREVIEW_MAX_CHARS
    if truncated:
        text = text[:_PREVIEW_MAX_CHARS]
    return {
        "content": text,
        "truncated": truncated,
        "size_bytes": size,
        "error": None,
    }
