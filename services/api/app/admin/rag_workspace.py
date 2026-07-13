"""RAG 工作台：磁盘文件树 CRUD、预览保存、chunk 列表（PC 管理端）。"""
from __future__ import annotations

import logging
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from ..config import REPO_ROOT, get_settings
from ..db import get_pool
from ..rag.index import index_file
from .rag_inventory import (
    _COLLECTIONS,
    _commentary_root,
    _index_documents,
    _inventory_status,
    _iter_md_files,
    _load_db_documents,
    _match_document,
    _status_label,
    build_rag_inventory,
)
from .rag_ops import upload_dir

logger = logging.getLogger(__name__)

_ALLOW_SUFFIX = {".md", ".txt", ".markdown"}
_SAFE_SEGMENT = re.compile(r"^[\w.\u4e00-\u9fff\-()（）【】\[\] ]+$")

# 可写集合：中文自有、手工、上传区；公版只读
WRITABLE_COLLECTION_IDS = frozenset({"zh-owned", "manual", "uploads"})


def _collection_spec(collection_id: str) -> dict:
    if collection_id == "uploads":
        return {
            "id": "uploads",
            "label": "上传暂存区",
            "source_type": "commentary",
            "subdir": "",
            "recursive": False,
            "writable": True,
        }
    for spec in _COLLECTIONS:
        if spec["id"] == collection_id:
            return {**spec, "writable": collection_id in WRITABLE_COLLECTION_IDS}
    raise HTTPException(status_code=404, detail="未知资料集合")


def _collection_root(collection_id: str) -> Path:
    if collection_id == "uploads":
        root = upload_dir()
        root.mkdir(parents=True, exist_ok=True)
        return root.resolve()
    spec = _collection_spec(collection_id)
    root = (_commentary_root() / spec["subdir"]).resolve()
    return root


def _assert_writable(collection_id: str) -> None:
    if collection_id not in WRITABLE_COLLECTION_IDS:
        raise HTTPException(status_code=403, detail="该集合为只读（公版资料），不可改删")


def _normalize_rel(path: str) -> str:
    raw = (path or "").strip().replace("\\", "/")
    if not raw or raw in (".", "/"):
        return ""
    parts: list[str] = []
    for seg in raw.split("/"):
        if not seg or seg == ".":
            continue
        if seg == ".." or seg.startswith("."):
            raise HTTPException(status_code=400, detail="路径非法")
        if not _SAFE_SEGMENT.match(seg):
            raise HTTPException(status_code=400, detail=f"路径段非法：{seg}")
        parts.append(seg)
    return "/".join(parts)


def _resolve_under(collection_id: str, rel: str) -> Path:
    root = _collection_root(collection_id)
    rel_norm = _normalize_rel(rel)
    target = (root / rel_norm).resolve() if rel_norm else root
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="路径越界") from exc
    return target


def _rel_to_root(collection_id: str, path: Path) -> str:
    root = _collection_root(collection_id)
    try:
        return str(path.resolve().relative_to(root)).replace("\\", "/")
    except ValueError:
        return path.name


def _doc_for_path(file_path: Path) -> dict | None:
    try:
        docs = _load_db_documents()
    except Exception:
        return None
    by_key, by_name = _index_documents(docs)
    return _match_document(file_path, by_key=by_key, by_name=by_name)


def _content_stale(file_path: Path, doc: dict | None) -> bool:
    if not doc or not doc.get("rag_index_at"):
        return bool(doc)
    try:
        mtime = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc)
        indexed = datetime.fromisoformat(doc["rag_index_at"].replace("Z", "+00:00"))
        if indexed.tzinfo is None:
            indexed = indexed.replace(tzinfo=timezone.utc)
        return mtime > indexed
    except (OSError, ValueError, TypeError):
        return False


def _rel_within_collection(collection_id: str, inventory_file: str) -> str:
    """inventory 的 file 相对 commentary 根；工作台 path 相对集合根。"""
    raw = (inventory_file or "").replace("\\", "/").strip("/")
    if not raw:
        return ""
    if collection_id == "uploads":
        return Path(raw).name
    spec = _collection_spec(collection_id)
    subdir = (spec.get("subdir") or "").strip("/")
    if subdir and (raw == subdir or raw.startswith(subdir + "/")):
        return raw[len(subdir) :].lstrip("/")
    # OCD 等 recursive 扫描也可能已是相对集合根
    return raw


def _ensure_folder_chain(folders: dict[str, dict], parts: list[str]) -> dict:
    """创建/取得嵌套文件夹节点，返回最内层 folder dict。"""
    parent_map = folders
    parent_path = ""
    current: dict | None = None
    for seg in parts:
        parent_path = f"{parent_path}/{seg}" if parent_path else seg
        if seg not in parent_map:
            parent_map[seg] = {
                "name": seg,
                "path": parent_path,
                "type": "folder",
                "children": [],
                "_folders": {},
            }
        current = parent_map[seg]
        parent_map = current.setdefault("_folders", {})
    assert current is not None
    return current


def _finalize_folder_tree(folders: dict[str, dict]) -> list[dict]:
    out: list[dict] = []
    for folder in sorted(folders.values(), key=lambda x: x["name"]):
        nested = _finalize_folder_tree(folder.pop("_folders", {}))
        files = [c for c in folder.get("children") or [] if c.get("type") == "file"]
        folder["children"] = nested + sorted(files, key=lambda x: x.get("name") or "")
        out.append(folder)
    return out


def build_workspace_tree() -> dict:
    """基于 inventory 构建树：集合 →（可选 subgroup/文件夹）→ 文件。"""
    inv = build_rag_inventory()
    collections_out: list[dict] = []

    for coll in inv.get("collections") or []:
        cid = coll["id"]
        writable = cid in WRITABLE_COLLECTION_IDS
        root = _collection_root(cid)
        folders: dict[str, dict] = {}
        files_flat: list[dict] = []
        seen_paths: set[str] = set()

        # 可写区：先扫真实子目录（含空文件夹）
        if writable and root.is_dir():
            for child in sorted(root.rglob("*")):
                if not child.is_dir() or child.name.startswith("."):
                    continue
                try:
                    rel_dir = str(child.relative_to(root)).replace("\\", "/")
                except ValueError:
                    continue
                if not rel_dir or rel_dir.startswith("."):
                    continue
                _ensure_folder_chain(folders, rel_dir.split("/"))

        for doc in coll.get("documents") or []:
            rel = _rel_within_collection(
                cid, doc.get("file") or doc.get("filename") or ""
            )
            if not rel or rel in seen_paths:
                continue
            seen_paths.add(rel)
            parts = rel.split("/")
            node = {
                "type": "file",
                "name": parts[-1],
                "path": rel,
                "inventory_status": doc.get("inventory_status"),
                "inventory_label": doc.get("inventory_label"),
                "document_id": doc.get("document_id"),
                "title": doc.get("title"),
                "chunks": doc.get("chunks") or 0,
                "size_bytes": doc.get("size_bytes"),
                "rag_index_error": doc.get("rag_index_error"),
                "writable": writable,
            }
            if len(parts) > 1:
                folder = _ensure_folder_chain(folders, parts[:-1])
                folder.setdefault("children", []).append(node)
            else:
                # OCD/HelloAO：用 subgroup 作逻辑文件夹（非真实 path）
                subgroup = doc.get("subgroup")
                if subgroup and not writable:
                    folder = _ensure_folder_chain(folders, [str(subgroup)])
                    # path 仍相对集合根，便于打开
                    folder.setdefault("children", []).append(node)
                else:
                    files_flat.append(node)

        # 可写区：磁盘上有、inventory 未列出的文件（如新建后未刷新计数）
        if writable and root.is_dir():
            for fp in _iter_md_files(root, recursive=True):
                try:
                    rel = str(fp.relative_to(root)).replace("\\", "/")
                except ValueError:
                    continue
                if not rel or rel in seen_paths:
                    continue
                seen_paths.add(rel)
                parts = rel.split("/")
                node = {
                    "type": "file",
                    "name": parts[-1],
                    "path": rel,
                    "inventory_status": "pending",
                    "inventory_label": "待索引",
                    "document_id": None,
                    "title": fp.stem,
                    "chunks": 0,
                    "size_bytes": fp.stat().st_size,
                    "rag_index_error": None,
                    "writable": True,
                }
                if len(parts) > 1:
                    folder = _ensure_folder_chain(folders, parts[:-1])
                    folder.setdefault("children", []).append(node)
                else:
                    files_flat.append(node)

        children = _finalize_folder_tree(folders)
        children.extend(sorted(files_flat, key=lambda x: x.get("name") or ""))

        collections_out.append({
            "id": cid,
            "label": coll.get("label"),
            "source_type": coll.get("source_type"),
            "dir": coll.get("dir"),
            "dir_exists": coll.get("dir_exists"),
            "writable": writable,
            "file_count": coll.get("file_count") or 0,
            "counts": coll.get("counts") or {},
            "children": children,
        })

    return {
        "summary": inv.get("summary") or {},
        "orphans": inv.get("orphans") or [],
        "collections": collections_out,
        "commentary_root": inv.get("commentary_root"),
    }


def read_workspace_file(*, collection_id: str, path: str) -> dict:
    target = _resolve_under(collection_id, path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    if target.suffix.lower() not in _ALLOW_SUFFIX:
        raise HTTPException(status_code=400, detail="仅支持文本预览")
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="文件须为 UTF-8") from exc

    doc = _doc_for_path(target)
    status = _inventory_status(doc, file_exists=True)
    stale = _content_stale(target, doc)
    spec = _collection_spec(collection_id)
    return {
        "collection_id": collection_id,
        "path": _rel_to_root(collection_id, target),
        "filename": target.name,
        "writable": collection_id in WRITABLE_COLLECTION_IDS,
        "source_type": spec.get("source_type"),
        "size_bytes": target.stat().st_size,
        "mtime": datetime.fromtimestamp(
            target.stat().st_mtime, tz=timezone.utc
        ).isoformat(),
        "content": content,
        "content_stale": stale,
        "inventory_status": status,
        "inventory_label": _status_label(status),
        "document_id": doc["id"] if doc else None,
        "title": doc["title"] if doc else target.stem,
        "chunks": doc["chunks"] if doc else 0,
        "rag_index_at": doc.get("rag_index_at") if doc else None,
        "rag_index_error": doc.get("rag_index_error") if doc else None,
        "db_status": doc.get("status") if doc else None,
    }


def save_workspace_file(*, collection_id: str, path: str, content: str) -> dict:
    _assert_writable(collection_id)
    target = _resolve_under(collection_id, path)
    if target.suffix.lower() not in _ALLOW_SUFFIX:
        raise HTTPException(status_code=400, detail="仅支持 .md / .txt")
    if not target.parent.is_dir():
        raise HTTPException(status_code=400, detail="父目录不存在")
    target.write_text(content if content is not None else "", encoding="utf-8")
    # 标记库内文档待重新索引
    doc = _doc_for_path(target)
    if doc:
        try:
            pool = get_pool()
            with pool.connection() as conn:
                conn.execute(
                    """
                    UPDATE bible_documents
                    SET status = 'pending', rag_index_error = NULL, updated_at = NOW()
                    WHERE id = %s::uuid
                    """,
                    (doc["id"],),
                )
                conn.commit()
        except Exception:
            logger.exception("mark document pending after save failed")
    return read_workspace_file(collection_id=collection_id, path=path)


def mkdir_workspace(*, collection_id: str, path: str) -> dict:
    _assert_writable(collection_id)
    target = _resolve_under(collection_id, path)
    if target.exists():
        raise HTTPException(status_code=409, detail="已存在同名路径")
    target.mkdir(parents=True, exist_ok=False)
    return {"ok": True, "path": _rel_to_root(collection_id, target)}


def create_workspace_file(
    *, collection_id: str, path: str, content: str | None = None
) -> dict:
    _assert_writable(collection_id)
    target = _resolve_under(collection_id, path)
    if target.suffix.lower() not in _ALLOW_SUFFIX:
        raise HTTPException(status_code=400, detail="仅支持 .md / .txt / .markdown")
    if target.exists():
        raise HTTPException(status_code=409, detail="文件已存在")
    target.parent.mkdir(parents=True, exist_ok=True)
    body = content if content is not None else f"# {target.stem}\n\n"
    target.write_text(body, encoding="utf-8")
    return read_workspace_file(
        collection_id=collection_id, path=_rel_to_root(collection_id, target)
    )


def rename_or_move_workspace(
    *,
    collection_id: str,
    from_path: str,
    to_path: str,
    to_collection_id: str | None = None,
) -> dict:
    _assert_writable(collection_id)
    dest_coll = to_collection_id or collection_id
    _assert_writable(dest_coll)
    src = _resolve_under(collection_id, from_path)
    if not src.exists():
        raise HTTPException(status_code=404, detail="源路径不存在")
    dest = _resolve_under(dest_coll, to_path)
    if dest.exists():
        raise HTTPException(status_code=409, detail="目标已存在")
    dest.parent.mkdir(parents=True, exist_ok=True)
    src_was_file = src.is_file()
    src_str = str(src)
    dest_str = str(dest)
    shutil.move(src_str, dest_str)

    # 更新 DB source_path
    try:
        pool = get_pool()
        with pool.connection() as conn:
            if src_was_file:
                conn.execute(
                    """
                    UPDATE bible_documents
                    SET source_path = %s, status = 'pending', updated_at = NOW()
                    WHERE source_path = %s OR source_path LIKE %s
                    """,
                    (dest_str, src_str, f"%/{Path(src_str).name}"),
                )
            else:
                conn.execute(
                    """
                    UPDATE bible_documents
                    SET source_path = replace(source_path, %s, %s),
                        status = 'pending',
                        updated_at = NOW()
                    WHERE source_path LIKE %s
                    """,
                    (src_str, dest_str, f"{src_str}%"),
                )
            conn.commit()
    except Exception:
        logger.exception("update source_path after move failed")

    return {
        "ok": True,
        "collection_id": dest_coll,
        "path": _rel_to_root(dest_coll, Path(dest_str)),
    }


def delete_workspace_path(
    *,
    collection_id: str,
    path: str,
    purge_db: bool = True,
) -> dict:
    _assert_writable(collection_id)
    target = _resolve_under(collection_id, path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="路径不存在")
    root = _collection_root(collection_id)
    if target == root:
        raise HTTPException(status_code=400, detail="不能删除集合根目录")

    removed_docs: list[str] = []
    if purge_db:
        try:
            pool = get_pool()
            with pool.connection() as conn:
                if target.is_file():
                    rows = conn.execute(
                        """
                        SELECT id FROM bible_documents
                        WHERE source_path = %s OR source_path LIKE %s
                        """,
                        (str(target), f"%/{target.name}"),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT id FROM bible_documents WHERE source_path LIKE %s",
                        (f"{target}%",),
                    ).fetchall()
                for (doc_id,) in rows:
                    conn.execute(
                        "DELETE FROM bible_documents WHERE id = %s::uuid", (doc_id,)
                    )
                    removed_docs.append(str(doc_id))
                conn.commit()
        except Exception:
            logger.exception("purge db on delete failed")

    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()

    return {"ok": True, "deleted_path": path, "removed_documents": removed_docs}


def list_document_chunks(document_id: str, *, limit: int = 50) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, title FROM bible_documents WHERE id = %s::uuid",
            (document_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="资料不存在")
        rows = conn.execute(
            """
            SELECT chunk_index, left(chunk_text, 400), length(chunk_text)
            FROM bible_rag_chunks
            WHERE document_id = %s::uuid
            ORDER BY chunk_index
            LIMIT %s
            """,
            (document_id, max(1, min(limit, 200))),
        ).fetchall()
        total = conn.execute(
            "SELECT count(*) FROM bible_rag_chunks WHERE document_id = %s::uuid",
            (document_id,),
        ).fetchone()[0]
    return {
        "document_id": str(row[0]),
        "title": row[1],
        "total": int(total or 0),
        "chunks": [
            {
                "index": int(r[0]),
                "preview": r[1] or "",
                "length": int(r[2] or 0),
            }
            for r in rows
        ],
    }


def index_workspace_file(*, collection_id: str, path: str, force: bool = True) -> dict:
    target = _resolve_under(collection_id, path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    spec = _collection_spec(collection_id)
    doc = _doc_for_path(target)
    title = doc["title"] if doc else target.stem
    try:
        result = index_file(
            target,
            source_type=spec.get("source_type") or "commentary",
            title=title,
            force=force,
        )
    except Exception as exc:
        logger.exception("workspace index failed")
        raise HTTPException(status_code=500, detail=f"索引失败：{exc}") from exc
    return {"ok": True, "index": result, "file": read_workspace_file(collection_id=collection_id, path=path)}
