"""管理员 RAG 操作：上传目录待索引、单文件向量化。"""
from __future__ import annotations

import logging
from pathlib import Path

from ..config import get_settings
from ..rag.index import guess_document_title, index_file
from .rag_inventory import _index_documents, _inventory_status, _load_db_documents, _match_document

logger = logging.getLogger(__name__)

_ALLOWED_SUFFIX = {".md", ".txt", ".markdown"}


def upload_dir() -> Path:
    return Path(get_settings().rag_upload_dir)


def _iter_upload_files() -> list[Path]:
    base = upload_dir()
    if not base.is_dir():
        return []
    return sorted(
        p for p in base.iterdir()
        if p.is_file() and p.suffix.lower() in _ALLOW_SUFFIX
    )


def list_pending_uploads() -> list[dict]:
    """磁盘上有文件但尚未成功入库的上传项。"""
    try:
        db_docs = _load_db_documents()
    except Exception:
        db_docs = []
    by_path, by_name = _index_documents(db_docs)
    out: list[dict] = []
    for fp in _iter_upload_files():
        doc = _match_document(fp, by_path=by_path, by_name=by_name)
        status = _inventory_status(doc, file_exists=True)
        if status in ("pending", "failed", "indexing"):
            out.append({
                "filename": fp.name,
                "path": str(fp.resolve()),
                "size_bytes": fp.stat().st_size,
                "inventory_status": status,
                "document_id": doc["id"] if doc else None,
                "title": doc["title"] if doc else guess_document_title(
                    fp.read_text(encoding="utf-8"), fp
                ),
            })
    return out


def index_upload_path(
    file_path: Path,
    *,
    title: str | None = None,
    source_type: str = "commentary",
    force: bool = True,
) -> dict:
    if not file_path.is_file():
        raise FileNotFoundError(f"文件不存在：{file_path}")
    if file_path.suffix.lower() not in _ALLOW_SUFFIX:
        raise ValueError("仅支持 .md / .txt 文件")
    base = upload_dir().resolve()
    try:
        file_path.resolve().relative_to(base)
    except ValueError as exc:
        raise ValueError("只能索引上传目录内的文件") from exc
    return index_file(
        file_path.resolve(),
        source_type=source_type,
        title=title,
        force=force,
    )


def index_pending_uploads(
    *,
    source_type: str = "commentary",
    force: bool = True,
) -> dict:
    pending = list_pending_uploads()
    results: list[dict] = []
    indexed = 0
    failed = 0
    skipped = 0
    for item in pending:
        fp = upload_dir() / item["filename"]
        try:
            result = index_upload_path(
                fp,
                title=item.get("title"),
                source_type=source_type,
                force=force,
            )
            if result.get("skipped"):
                skipped += 1
            else:
                indexed += 1
            results.append({"filename": item["filename"], **result})
        except Exception as exc:
            failed += 1
            logger.exception("index pending upload failed: %s", fp)
            results.append({"filename": item["filename"], "error": str(exc)})
    return {
        "pending": len(pending),
        "indexed": indexed,
        "skipped": skipped,
        "failed": failed,
        "results": results,
    }
