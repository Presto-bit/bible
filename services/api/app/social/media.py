"""社交消息附件上传（图 + PDF/Office + 文本）。"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile

from .blob_store import attachment_url, get_blob_store, normalize_object_key, unlink_storage_keys

_ALLOW_SUFFIX = {
    ".jpg", ".jpeg", ".png", ".webp", ".gif",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".md", ".csv",
}
_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
}
_MAX_BYTES = 20 * 1024 * 1024
_IMAGE = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def media_dir():
    """兼容旧代码：返回本地目录 Path（仅 local 模式有意义）。"""
    from .blob_store import local_media_dir

    return local_media_dir()


def build_attachment_row(
    *,
    storage_key: str | None,
    file_name: str | None,
    mime: str | None,
    size_bytes: int | None,
    att_id: str,
) -> dict:
    key = normalize_object_key(storage_key or "")
    fname = Path(key).name if key else (file_name or "")
    return {
        "id": att_id,
        "file_name": file_name,
        "mime": mime,
        "size_bytes": size_bytes,
        "storage_key": key or None,
        "url": attachment_url(storage_key, file_name) if (key or fname) else None,
    }


async def save_social_upload(*, file: UploadFile, prefix: str = "m") -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOW_SUFFIX:
        raise HTTPException(400, "仅支持图片、PDF/Office 或 txt/md/csv")
    raw = await file.read()
    if len(raw) > _MAX_BYTES:
        raise HTTPException(400, "单个文件不能超过 20MB")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if not content_type or content_type == "application/octet-stream":
        content_type = _MIME[suffix]
    digest = hashlib.sha256(raw).hexdigest()[:16]
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", prefix)[:12] or "m"
    object_key = f"social-im/{safe}/{digest}{suffix}"
    store = get_blob_store()
    stored_key = store.put(object_key, raw, content_type)
    kind = "image" if suffix in _IMAGE else "file"
    url = store.url(stored_key)
    return {
        "kind": kind,
        "file_name": Path(file.filename or stored_key).name[:180],
        "mime_type": content_type,
        "size_bytes": len(raw),
        "storage_key": stored_key,
        "url": url,
    }


__all__ = [
    "attachment_url",
    "build_attachment_row",
    "media_dir",
    "save_social_upload",
    "unlink_storage_keys",
]
