"""RAG 资料清单：磁盘文件 × 数据库文档，按数据源汇总状态。"""
from __future__ import annotations

import json
import re
from pathlib import Path

from ..config import REPO_ROOT, get_settings
from ..rag.paths import normalize_source_path, path_match_keys

HELLOAO_SOURCES = (
    "jamieson-fausset-brown",
    "keil-delitzsch",
    "matthew-henry",
    "adam-clarke",
    "john-gill",
    "tyndale",
)

_COLLECTIONS: tuple[dict, ...] = (
    {
        "id": "helloao",
        "label": "HelloAO 公版注释",
        "source_type": "commentary",
        "subdir": "public-domain",
        "recursive": False,
    },
    {
        "id": "ocd",
        "label": "OpenChristianData 注释",
        "source_type": "commentary",
        "subdir": "public-domain-ocd",
        "recursive": True,
    },
    {
        "id": "reference",
        "label": "英文参考词典",
        "source_type": "reference-en",
        "subdir": "reference-en",
        "recursive": False,
    },
    {
        "id": "zh-owned",
        "label": "中文自有资料",
        "source_type": "study-bible-zh",
        "subdir": "study-bible-zh",
        "recursive": True,
    },
    {
        "id": "manual",
        "label": "手工研经资料",
        "source_type": "study-bible",
        "subdir": "study-bible",
        "recursive": True,
    },
)


def _commentary_root() -> Path:
    return REPO_ROOT / "content" / "commentary"


def _helloao_source_from_stem(stem: str) -> str | None:
    for src in HELLOAO_SOURCES:
        if stem == src or stem.startswith(f"{src}-"):
            return src
    return None


def _load_db_documents() -> list[dict]:
    from ..db import get_pool

    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            """
            SELECT d.id, d.title, d.source_type, d.status, d.source_path,
                   d.rag_index_at, d.rag_index_error, d.created_at,
                   count(c.chunk_index)::int AS chunks
            FROM bible_documents d
            LEFT JOIN bible_rag_chunks c ON c.document_id = d.id
            GROUP BY d.id
            ORDER BY d.created_at DESC
            """
        ).fetchall()
    out: list[dict] = []
    for r in rows:
        out.append({
            "id": str(r[0]),
            "title": r[1],
            "source_type": r[2],
            "status": r[3],
            "source_path": r[4],
            "rag_index_at": r[5].isoformat() if r[5] else None,
            "rag_index_error": r[6],
            "created_at": r[7].isoformat() if r[7] else None,
            "chunks": r[8] or 0,
        })
    return out


def _index_documents(docs: list[dict]) -> tuple[dict[str, dict], dict[str, list[dict]]]:
    by_key: dict[str, dict] = {}
    by_name: dict[str, list[dict]] = {}
    for doc in docs:
        sp = (doc.get("source_path") or "").strip()
        if sp:
            norm = normalize_source_path(sp)
            for key in path_match_keys(norm):
                # 同一键冲突时保留已有 chunks 更多的记录
                prev = by_key.get(key)
                if prev is None or int(doc.get("chunks") or 0) >= int(prev.get("chunks") or 0):
                    by_key[key] = doc
            name = Path(sp).name
            by_name.setdefault(name, []).append(doc)
    return by_key, by_name


def _match_document(
    file_path: Path,
    *,
    by_key: dict[str, dict],
    by_name: dict[str, list[dict]],
) -> dict | None:
    for key in path_match_keys(file_path):
        hit = by_key.get(key)
        if hit is not None:
            return hit
    hits = by_name.get(file_path.name) or []
    if not hits:
        return None
    if len(hits) == 1:
        return hits[0]
    file_keys = path_match_keys(file_path)
    best: dict | None = None
    best_score = -1
    for doc in hits:
        sp = (doc.get("source_path") or "").strip()
        doc_keys = path_match_keys(normalize_source_path(sp)) if sp else set()
        overlap = len(file_keys & doc_keys)
        score = overlap * 1000 + int(doc.get("chunks") or 0)
        if score > best_score:
            best_score = score
            best = doc
    return best if best_score > 0 else None


def _inventory_status(doc: dict | None, *, file_exists: bool) -> str:
    if doc is None:
        return "pending" if file_exists else "orphan"
    if doc.get("rag_index_error"):
        return "failed"
    st = (doc.get("status") or "").lower()
    chunks = int(doc.get("chunks") or 0)
    if st == "indexing":
        return "indexing"
    if st == "ready" and chunks > 0:
        return "indexed"
    if st in ("ready", "indexed") and chunks == 0:
        return "failed"
    if st in ("failed", "error"):
        return "failed"
    return "pending"


def _status_label(status: str) -> str:
    return {
        "indexed": "已入库",
        "pending": "待索引",
        "failed": "失败",
        "indexing": "进行中",
        "orphan": "仅数据库",
    }.get(status, status)


def _iter_md_files(base: Path, *, recursive: bool) -> list[Path]:
    if not base.is_dir():
        return []
    pattern = "**/*" if recursive else "*"
    files = [
        p for p in base.glob(pattern)
        if p.is_file() and p.suffix.lower() in (".md", ".txt", ".markdown")
        and not p.name.startswith("meta")
    ]
    return sorted(files)


def _load_import_meta(base: Path) -> list[dict]:
    items: list[dict] = []
    if not base.is_dir():
        return items
    for meta_path in sorted(base.glob("meta*.json")):
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        books_status = data.get("books_status") or {}
        expected = sum(int(v.get("expected") or 0) for v in books_status.values())
        done = sum(
            1 for v in books_status.values()
            if int(v.get("chapters") or 0) >= int(v.get("expected") or 0)
            or v.get("exhausted")
        )
        items.append({
            "file": meta_path.name,
            "id": data.get("id") or meta_path.stem.replace("meta-", ""),
            "title": data.get("title") or meta_path.stem,
            "language": data.get("language"),
            "books_total": len(books_status) or None,
            "books_done": done or None,
            "chapters_expected": expected or None,
            "books_status": books_status,
        })
    return items


def _file_subgroup(collection_id: str, file_path: Path, root: Path) -> str | None:
    rel = file_path.relative_to(root)
    if collection_id == "helloao":
        return _helloao_source_from_stem(file_path.stem)
    if collection_id == "ocd" and len(rel.parts) > 1:
        return rel.parts[0]
    return None


def _scan_collection(
    spec: dict,
    *,
    root: Path,
    by_key: dict[str, dict],
    by_name: dict[str, list[dict]],
    matched_ids: set[str],
) -> dict:
    base = root / spec["subdir"]
    files = _iter_md_files(base, recursive=spec["recursive"])
    documents: list[dict] = []
    counts = {"indexed": 0, "pending": 0, "failed": 0, "indexing": 0, "orphan": 0}

    for fp in files:
        doc = _match_document(fp, by_key=by_key, by_name=by_name)
        if doc:
            matched_ids.add(doc["id"])
        status = _inventory_status(doc, file_exists=True)
        counts[status] = counts.get(status, 0) + 1
        try:
            rel = str(fp.relative_to(root))
        except ValueError:
            rel = fp.name
        documents.append({
            "file": rel,
            "filename": fp.name,
            "subgroup": _file_subgroup(spec["id"], fp, base),
            "size_bytes": fp.stat().st_size,
            "inventory_status": status,
            "inventory_label": _status_label(status),
            "document_id": doc["id"] if doc else None,
            "title": doc["title"] if doc else fp.stem,
            "chunks": doc["chunks"] if doc else 0,
            "rag_index_at": doc["rag_index_at"] if doc else None,
            "rag_index_error": doc["rag_index_error"] if doc else None,
            "db_status": doc["status"] if doc else None,
        })

    return {
        "id": spec["id"],
        "label": spec["label"],
        "source_type": spec["source_type"],
        "dir": str(base.relative_to(REPO_ROOT)) if base.exists() else spec["subdir"],
        "dir_exists": base.is_dir(),
        "file_count": len(files),
        "counts": counts,
        "import_meta": _load_import_meta(base),
        "documents": documents,
    }


def _scan_uploads(
    *,
    by_key: dict[str, dict],
    by_name: dict[str, list[dict]],
    matched_ids: set[str],
) -> dict:
    upload_dir = Path(get_settings().rag_upload_dir)
    files = _iter_md_files(upload_dir, recursive=False)
    documents: list[dict] = []
    counts = {"indexed": 0, "pending": 0, "failed": 0, "indexing": 0, "orphan": 0}

    for fp in files:
        doc = _match_document(fp, by_key=by_key, by_name=by_name)
        if doc:
            matched_ids.add(doc["id"])
        status = _inventory_status(doc, file_exists=True)
        counts[status] = counts.get(status, 0) + 1
        documents.append({
            "file": fp.name,
            "filename": fp.name,
            "subgroup": "upload",
            "size_bytes": fp.stat().st_size,
            "inventory_status": status,
            "inventory_label": _status_label(status),
            "document_id": doc["id"] if doc else None,
            "title": doc["title"] if doc else fp.stem,
            "chunks": doc["chunks"] if doc else 0,
            "source_type": doc["source_type"] if doc else "commentary",
            "rag_index_at": doc["rag_index_at"] if doc else None,
            "rag_index_error": doc["rag_index_error"] if doc else None,
            "db_status": doc["status"] if doc else None,
        })

    return {
        "id": "uploads",
        "label": "后台上传",
        "source_type": "mixed",
        "dir": str(upload_dir.relative_to(REPO_ROOT)) if upload_dir.exists() else "data/rag/uploads",
        "dir_exists": upload_dir.is_dir(),
        "file_count": len(files),
        "counts": counts,
        "import_meta": [],
        "documents": documents,
    }


def build_rag_inventory() -> dict:
    root = _commentary_root()
    db_error: str | None = None
    try:
        db_docs = _load_db_documents()
    except Exception as exc:
        db_docs = []
        db_error = str(exc)

    by_key, by_name = _index_documents(db_docs)
    matched_ids: set[str] = set()

    collections = [
        _scan_collection(spec, root=root, by_key=by_key, by_name=by_name, matched_ids=matched_ids)
        for spec in _COLLECTIONS
    ]
    collections.append(
        _scan_uploads(by_key=by_key, by_name=by_name, matched_ids=matched_ids)
    )

    orphans: list[dict] = []
    orphan_counts = 0
    for doc in db_docs:
        if doc["id"] in matched_ids:
            continue
        status = _inventory_status(doc, file_exists=False)
        orphan_counts += 1
        orphans.append({
            **doc,
            "inventory_status": status,
            "inventory_label": _status_label(status),
        })

    summary = {
        "indexed": 0,
        "pending": 0,
        "failed": 0,
        "indexing": 0,
        "orphan": orphan_counts,
        "files_on_disk": 0,
        "db_documents": len(db_docs),
        "db_chunks": sum(int(d.get("chunks") or 0) for d in db_docs),
    }
    for coll in collections:
        summary["files_on_disk"] += coll["file_count"]
        for key in ("indexed", "pending", "failed", "indexing"):
            summary[key] += coll["counts"].get(key, 0)

    return {
        "commentary_root": str(root),
        "commentary_root_exists": root.is_dir(),
        "db_error": db_error,
        "summary": summary,
        "collections": collections,
        "orphans": orphans,
    }


def list_orphan_document_ids() -> list[str]:
    """返回仅存在于数据库、磁盘无对应文件的文档 ID。"""
    inv = build_rag_inventory()
    if inv.get("db_error"):
        raise RuntimeError(inv["db_error"])
    return [str(o["id"]) for o in (inv.get("orphans") or []) if o.get("id")]


def purge_rag_orphans() -> dict:
    """删除所有孤儿文档（chunks 随 FK CASCADE 清理）。"""
    from ..db import get_pool

    ids = list_orphan_document_ids()
    if not ids:
        return {"ok": True, "deleted": 0, "ids": []}

    pool = get_pool()
    with pool.connection() as conn:
        conn.execute(
            "DELETE FROM bible_documents WHERE id = ANY(%s::uuid[])",
            (ids,),
        )
        conn.commit()
    return {"ok": True, "deleted": len(ids), "ids": ids}
