"""书目资产索引：校验 storage_key 是否属于该书。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .store import shelf_dir, shelf_file_path

_ATTACHMENT_EXT: dict[str, tuple[str, str]] = {
    ".png": ("image", "image/png"),
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".webp": ("image", "image/webp"),
    ".gif": ("image", "image/gif"),
    ".mp4": ("video", "video/mp4"),
    ".webm": ("video", "video/webm"),
    ".mov": ("video", "video/quicktime"),
    ".m4a": ("audio", "audio/mp4"),
    ".mp3": ("audio", "audio/mpeg"),
    ".wav": ("audio", "audio/wav"),
}


def _section_primary_stem(section: dict[str, Any]) -> str:
    primary = section.get("primary") or {}
    sk = str(primary.get("storage_key") or "")
    return Path(sk).stem if sk else ""


def _section_primary_name(section: dict[str, Any]) -> str:
    primary = section.get("primary") or {}
    sk = str(primary.get("storage_key") or "")
    return Path(sk).name if sk else ""


def is_lesson_sibling_asset(section: dict[str, Any], storage_key: str) -> bool:
    """同课节主文件 stem 下的图片/视频/音频（如 cur-u3-l3-story.mp4）。"""
    stem = _section_primary_stem(section)
    primary_name = _section_primary_name(section)
    if not stem:
        return False
    name = Path(storage_key).name
    if not name.startswith(stem) or name == primary_name:
        return False
    return Path(name).suffix.lower() in _ATTACHMENT_EXT


def infer_section_attachments(section: dict[str, Any]) -> list[dict[str, Any]]:
    """catalog 未登记时，从 shelf_uploads 按课节 stem 自动发现附件。"""
    existing = section.get("attachments") or []
    if existing:
        return list(existing)
    stem = _section_primary_stem(section)
    primary_name = _section_primary_name(section)
    if not stem:
        return []
    uploads = shelf_dir()
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    for path in sorted(uploads.iterdir()):
        if not path.is_file():
            continue
        name = path.name
        if name == primary_name or not name.startswith(stem):
            continue
        ext = path.suffix.lower()
        meta = _ATTACHMENT_EXT.get(ext)
        if not meta:
            continue
        kind, mime = meta
        if name in seen:
            continue
        seen.add(name)
        title = Path(name).stem
        if title.startswith(stem):
            suffix = title[len(stem) :].lstrip("-_")
            if suffix:
                title = suffix.replace("-", " ").replace("_", " ")
        found.append(
            {
                "id": f"att-{Path(name).stem}",
                "title": title or name,
                "kind": kind,
                "storage_key": name,
                "mime": mime,
            }
        )
    return found


def book_asset_keys(book: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    root = book.get("storage_key")
    if root:
        keys.add(str(root))
    for section in book.get("sections") or []:
        if not isinstance(section, dict):
            continue
        primary = section.get("primary")
        if isinstance(primary, dict) and primary.get("storage_key"):
            keys.add(str(primary["storage_key"]))
        for att in infer_section_attachments(section):
            if att.get("storage_key"):
                keys.add(str(att["storage_key"]))
    return keys


def asset_allowed(book: dict[str, Any], storage_key: str) -> bool:
    name = Path(storage_key).name
    if name in book_asset_keys(book):
        return True
    if (book.get("book_type") or "") != "collection":
        return False
    for section in book.get("sections") or []:
        if isinstance(section, dict) and is_lesson_sibling_asset(section, name):
            return shelf_file_path(name).is_file()
    return False
