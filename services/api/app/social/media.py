"""社交消息附件上传（图 + PDF/Office）。"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile

from ..config import REPO_ROOT, get_settings

_ALLOW_SUFFIX = {
    ".jpg", ".jpeg", ".png", ".webp", ".gif",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
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
}
_MAX_BYTES = 20 * 1024 * 1024
_IMAGE = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def media_dir() -> Path:
    settings = get_settings()
    raw = getattr(settings, "social_media_upload_dir", None)
    base = Path(raw) if raw else (REPO_ROOT / "data" / "social_message_uploads")
    base.mkdir(parents=True, exist_ok=True)
    return base


async def save_social_upload(*, file: UploadFile, prefix: str = "m") -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOW_SUFFIX:
        raise HTTPException(400, "仅支持图片或 PDF/Office 文档")
    raw = await file.read()
    if len(raw) > _MAX_BYTES:
        raise HTTPException(400, "单个文件不能超过 20MB")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if not content_type or content_type == "application/octet-stream":
        content_type = _MIME[suffix]
    digest = hashlib.sha256(raw).hexdigest()[:16]
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", prefix)[:12] or "m"
    filename = f"{safe}-{digest}{suffix}"
    dest = media_dir() / filename
    dest.write_bytes(raw)
    kind = "image" if suffix in _IMAGE else "file"
    url = f"/content/social-media/assets/{filename}"
    return {
        "kind": kind,
        "file_name": Path(file.filename or filename).name[:180],
        "mime_type": content_type,
        "size_bytes": len(raw),
        "storage_key": str(dest),
        "url": url,
    }


def unlink_storage_keys(keys: list[str]) -> int:
    """尽力删除本地附件文件；返回成功删除数。"""
    removed = 0
    root = media_dir().resolve()
    for key in keys:
        if not key:
            continue
        try:
            path = Path(key)
            if not path.is_absolute():
                path = root / Path(key).name
            else:
                path = path.resolve()
            if path.parent.resolve() != root:
                # 兼容 storage_key 为完整路径且位于媒体目录
                if not str(path).startswith(str(root) + "/"):
                    continue
            if path.is_file():
                path.unlink(missing_ok=True)
                removed += 1
        except Exception:
            continue
    return removed
