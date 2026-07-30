"""社交消息附件上传（图 + 音视频 + PDF/Office + 文本）。"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException, UploadFile

from .blob_store import attachment_url, get_blob_store, normalize_object_key, unlink_storage_keys

_IMAGE = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
_VIDEO = {".mp4", ".webm", ".mov", ".m4v"}
_AUDIO = {".mp3", ".m4a", ".wav", ".aac", ".ogg", ".oga"}
_DOC = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".md", ".csv",
}
_ALLOW_SUFFIX = _IMAGE | _VIDEO | _AUDIO | _DOC
_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
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
_MAX_BYTES = 50 * 1024 * 1024


def resolve_media_kind(mime: str | None, file_name: str | None = None) -> str:
    """根据 mime / 扩展名判定消息 kind：image | video | audio | file。"""
    m = (mime or "").split(";")[0].strip().lower()
    if m.startswith("image/"):
        return "image"
    if m.startswith("video/"):
        return "video"
    if m.startswith("audio/"):
        return "audio"
    suffix = Path(file_name or "").suffix.lower()
    if suffix in _IMAGE:
        return "image"
    if suffix in _VIDEO:
        return "video"
    if suffix in _AUDIO:
        return "audio"
    return "file"


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
        raise HTTPException(400, "仅支持图片、音视频、PDF/Office 或 txt/md/csv")
    raw = await file.read()
    if len(raw) > _MAX_BYTES:
        raise HTTPException(400, "单个文件不能超过 50MB")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if not content_type or content_type == "application/octet-stream":
        content_type = _MIME[suffix]
    digest = hashlib.sha256(raw).hexdigest()[:16]
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", prefix)[:12] or "m"
    object_key = f"social-im/{safe}/{digest}{suffix}"
    store = get_blob_store()
    stored_key = store.put(object_key, raw, content_type)
    kind = resolve_media_kind(content_type, file.filename)
    url = store.url(stored_key)
    return {
        "kind": kind,
        "file_name": Path(file.filename or stored_key).name[:180],
        "mime_type": content_type,
        "size_bytes": len(raw),
        "storage_key": stored_key,
        "url": url,
    }


async def save_profile_avatar(*, file: UploadFile, user_id: str) -> dict[str, Any]:
    """资料头像：独立前缀，不进 IM 30 天清理；固定 key 可覆盖。"""
    suffix = Path(file.filename or "avatar.jpg").suffix.lower()
    if suffix not in _IMAGE:
        raise HTTPException(400, "头像仅支持 jpg/png/webp/gif")
    raw = await file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(400, "头像不能超过 8MB")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if not content_type or content_type == "application/octet-stream":
        content_type = _MIME.get(suffix, "image/jpeg")
    uid = re.sub(r"[^a-zA-Z0-9_-]", "", (user_id or "").replace("-", ""))[:36] or "anon"
    # 本地 BlobStore 按文件名扁平落盘：用唯一文件名，避免多用户互相覆盖
    object_key = f"profile-avatar-{uid}{suffix if suffix else '.jpg'}"
    store = get_blob_store()
    for old_suf in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        old_key = f"profile-avatar-{uid}{old_suf}"
        if old_key != object_key:
            try:
                store.delete(old_key)
            except Exception:
                pass
    stored_key = store.put(object_key, raw, content_type)
    return {
        "kind": "image",
        "file_name": Path(file.filename or stored_key).name[:180],
        "mime_type": content_type,
        "size_bytes": len(raw),
        "storage_key": stored_key,
        # 持久引用：客户端应存 storage_key，勿存短时签名 url
        "url": f"/social/media/profile-asset?key={quote(stored_key, safe='')}",
    }


__all__ = [
    "attachment_url",
    "build_attachment_row",
    "media_dir",
    "resolve_media_kind",
    "save_profile_avatar",
    "save_social_upload",
    "unlink_storage_keys",
]
