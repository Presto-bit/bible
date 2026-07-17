"""社交 IM 附件存储：本地盘或 S3 兼容对象存储（OSS/COS/MinIO）。"""
from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_LOCAL_DIR = REPO_ROOT / "data" / "social_message_uploads"
PRESIGN_EXPIRES = 86_400  # 24h


class BlobStore(ABC):
    @abstractmethod
    def put(self, key: str, data: bytes, content_type: str) -> str:
        """写入对象，返回规范化 object key。"""

    @abstractmethod
    def delete(self, key: str) -> bool:
        """删除对象；不存在时返回 False。"""

    @abstractmethod
    def url(self, key: str, *, expires: int = PRESIGN_EXPIRES) -> str:
        """读取 URL（本地为同源路径，对象存储为签名 URL）。"""

    @abstractmethod
    def read_bytes(self, key: str) -> bytes:
        """读取对象字节（预览/转码用）。"""

    def exists(self, key: str) -> bool:
        try:
            self.read_bytes(key)
            return True
        except Exception:
            return False


class LocalBlobStore(BlobStore):
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        safe = normalize_object_key(key)
        path = (self.root / Path(safe).name).resolve()
        if not str(path).startswith(str(self.root) + "/") and path != self.root:
            raise ValueError("非法 storage key")
        return path

    def put(self, key: str, data: bytes, content_type: str) -> str:
        _ = content_type
        safe = normalize_object_key(key)
        dest = self._path(safe)
        dest.write_bytes(data)
        return safe

    def delete(self, key: str) -> bool:
        try:
            path = self._path(key)
            if path.is_file():
                path.unlink(missing_ok=True)
                return True
        except Exception:
            pass
        return False

    def url(self, key: str, *, expires: int = PRESIGN_EXPIRES) -> str:
        from ..auth.local_session import make_media_asset_sig

        object_key = normalize_object_key(key)
        name = Path(object_key).name
        exp = int(time.time()) + max(60, int(expires))
        # 签名绑定完整 object key，URL 带 k= 防同名碰撞
        sig = make_media_asset_sig(object_key, exp)
        return (
            f"/social/media/assets/{quote(name, safe='')}"
            f"?exp={exp}&sig={sig}&k={quote(object_key, safe='')}"
        )

    def read_bytes(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise FileNotFoundError(key)
        return path.read_bytes()


class S3BlobStore(BlobStore):
    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        access_key: str,
        secret_key: str,
        endpoint: str | None = None,
        public_base: str | None = None,
    ) -> None:
        import boto3
        from botocore.client import Config

        self.bucket = bucket
        self.public_base = (public_base or "").rstrip("/") or None
        kw: dict = {
            "service_name": "s3",
            "region_name": region or "us-east-1",
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
            "config": Config(signature_version="s3v4"),
        }
        if endpoint:
            kw["endpoint_url"] = endpoint
        self._client = boto3.client(**kw)

    def put(self, key: str, data: bytes, content_type: str) -> str:
        safe = normalize_object_key(key)
        self._client.put_object(
            Bucket=self.bucket,
            Key=safe,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )
        return safe

    def delete(self, key: str) -> bool:
        safe = normalize_object_key(key)
        try:
            self._client.head_object(Bucket=self.bucket, Key=safe)
        except Exception:
            return False
        self._client.delete_object(Bucket=self.bucket, Key=safe)
        return True

    def url(self, key: str, *, expires: int = PRESIGN_EXPIRES) -> str:
        safe = normalize_object_key(key)
        # 一律预签名；忽略 public_base 裸链（防未授权直链枚举）
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": safe},
            ExpiresIn=max(60, min(expires, 604_800)),
        )

    def read_bytes(self, key: str) -> bytes:
        safe = normalize_object_key(key)
        obj = self._client.get_object(Bucket=self.bucket, Key=safe)
        return obj["Body"].read()


def normalize_object_key(storage_key: str) -> str:
    """兼容历史绝对路径 storage_key，统一为 object key / 文件名。"""
    raw = (storage_key or "").strip()
    if not raw:
        return ""
    if raw.startswith("social-im/"):
        return raw
    p = Path(raw)
    name = p.name
    if "/" in raw and not raw.startswith("/"):
        return raw
    return name


def local_media_dir() -> Path:
    from ..config import get_settings

    settings = get_settings()
    raw = getattr(settings, "social_media_upload_dir", None)
    return Path(raw) if raw else DEFAULT_LOCAL_DIR


@lru_cache
def get_blob_store() -> BlobStore:
    from ..config import get_settings

    settings = get_settings()
    backend = (getattr(settings, "social_media_backend", None) or "local").strip().lower()
    if backend == "s3":
        bucket = (getattr(settings, "social_media_bucket", None) or "").strip()
        access = (getattr(settings, "social_media_access_key_id", None) or "").strip()
        secret = (getattr(settings, "social_media_secret_access_key", None) or "").strip()
        if not bucket or not access or not secret:
            logger.warning("social_media_backend=s3 但凭据未配置，回退本地存储")
            return LocalBlobStore(local_media_dir())
        return S3BlobStore(
            bucket=bucket,
            region=(getattr(settings, "social_media_region", None) or "us-east-1").strip(),
            access_key=access,
            secret_key=secret,
            endpoint=(getattr(settings, "social_media_endpoint", None) or "").strip() or None,
            public_base=(getattr(settings, "social_media_public_base", None) or "").strip() or None,
        )
    return LocalBlobStore(local_media_dir())


def attachment_url(storage_key: str | None, file_name: str | None = None) -> str | None:
    key = normalize_object_key(storage_key or "")
    if not key and file_name:
        key = Path(file_name).name
    if not key:
        return None
    store = get_blob_store()
    try:
        return store.url(key)
    except Exception:
        logger.exception("attachment_url failed for key=%s", key)
        return None


def unlink_storage_keys(keys: list[str]) -> int:
    store = get_blob_store()
    removed = 0
    for key in keys:
        if not key:
            continue
        try:
            if store.delete(normalize_object_key(key)):
                removed += 1
        except Exception:
            continue
    return removed
