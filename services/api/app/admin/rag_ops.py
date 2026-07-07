"""管理员 RAG 操作：上传目录待索引、磁盘批量向量化。"""
from __future__ import annotations

import logging
from pathlib import Path

from ..config import get_settings
from ..rag.index import guess_document_title, index_file, load_embedding_cache_for_texts
from ..rag.core import split_text_into_chunks
from ..rag.paths import commentary_root, commentary_subpath, storage_source_path
from .rag_inventory import (
    _COLLECTIONS,
    _commentary_root,
    _index_documents,
    _inventory_status,
    _load_db_documents,
    _match_document,
    build_rag_inventory,
)

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
    by_key, by_name = _index_documents(db_docs)
    out: list[dict] = []
    for fp in _iter_upload_files():
        doc = _match_document(fp, by_key=by_key, by_name=by_name)
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
            body = fp.read_text(encoding="utf-8")
            chunks = split_text_into_chunks(body)
            cache = load_embedding_cache_for_texts(chunks, source_type)
            result = index_file(
                fp.resolve(),
                source_type=source_type,
                title=item.get("title"),
                force=force,
                embedding_cache=cache,
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


def reset_stale_indexing(*, minutes: int = 30) -> int:
    """将长时间卡在 indexing 的文档标为失败，便于修复按钮重试。"""
    from ..db import get_pool

    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            """
            UPDATE bible_documents
            SET status = 'failed',
                rag_index_error = COALESCE(NULLIF(rag_index_error, ''), '索引中断，请重试'),
                updated_at = now()
            WHERE status = 'indexing'
              AND updated_at < now() - make_interval(mins => %s)
            RETURNING id
            """,
            (minutes,),
        ).fetchall()
        conn.commit()
    return len(rows)


def realign_document_paths() -> int:
    """将历史绝对路径统一为 content/commentary/...，便于清单匹配。"""
    from ..db import get_pool

    root = commentary_root()
    updated = 0
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute("SELECT id, source_path FROM bible_documents").fetchall()
        for doc_id, sp in rows:
            if not sp:
                continue
            sub = commentary_subpath(sp)
            if not sub:
                continue
            fp = root / sub
            if not fp.is_file():
                continue
            canonical = storage_source_path(fp)
            if sp != canonical:
                conn.execute(
                    "UPDATE bible_documents SET source_path=%s, updated_at=now() WHERE id=%s",
                    (canonical, doc_id),
                )
                updated += 1
        conn.commit()
    return updated


def index_pending_disk(
    *,
    collection_id: str | None = None,
    force: bool = True,
    limit: int | None = 8,
) -> dict:
    """对清单中 pending/failed/indexing 的磁盘文件批量向量化。"""
    stale_reset = 0
    try:
        stale_reset = reset_stale_indexing()
    except Exception as exc:
        logger.warning("reset stale indexing failed: %s", exc)
    try:
        realign_document_paths()
    except Exception as exc:
        logger.warning("realign document paths failed: %s", exc)

    inv = build_rag_inventory()
    root = _commentary_root()
    udir = upload_dir()

    tasks: list[tuple[Path, str, str | None]] = []
    for coll in inv["collections"]:
        if collection_id and coll["id"] != collection_id:
            continue
        for doc in coll["documents"]:
            if doc["inventory_status"] not in ("pending", "failed", "indexing"):
                continue
            if coll["id"] == "uploads":
                fp = udir / doc["filename"]
                st = doc.get("source_type") or "commentary"
            else:
                fp = root / doc["file"]
                st = coll["source_type"]
            tasks.append((fp, st, doc.get("title")))

    total = len(tasks)
    if limit is not None and limit > 0:
        tasks = tasks[:limit]

    indexed = skipped = failed = 0
    results: list[dict] = []
    for fp, st, title in tasks:
        if not fp.is_file():
            failed += 1
            results.append({"file": str(fp), "error": "源文件不存在"})
            continue
        try:
            body = fp.read_text(encoding="utf-8")
            chunks = split_text_into_chunks(body)
            cache = load_embedding_cache_for_texts(chunks, st)
            result = index_file(
                fp.resolve(),
                source_type=st,
                title=title,
                force=force,
                embedding_cache=cache,
            )
            if result.get("skipped"):
                skipped += 1
            else:
                indexed += 1
            results.append({"file": fp.name, **result})
        except Exception as exc:
            failed += 1
            logger.exception("index pending disk failed: %s", fp)
            results.append({"file": fp.name, "error": str(exc)})

    return {
        "pending": total,
        "processed": len(tasks),
        "has_more": len(tasks) < total,
        "remaining": max(0, total - len(tasks)),
        "stale_reset": stale_reset,
        "indexed": indexed,
        "skipped": skipped,
        "failed": failed,
        "results": results,
    }


def collection_source_types() -> dict[str, str]:
    return {spec["id"]: spec["source_type"] for spec in _COLLECTIONS}


def _repo_root() -> Path:
    # .../services/api/app/admin/rag_ops.py → 仓库根 /app
    return Path(__file__).resolve().parents[4]


def _run_py_script(
    script: str,
    *args: str,
    timeout: int = 3600,
) -> dict:
    import subprocess
    import sys

    root = _repo_root()
    script_path = root / "scripts" / script
    if not script_path.is_file():
        return {"script": script, "ok": False, "error": f"缺少脚本：{script_path}"}
    cmd = [sys.executable, str(script_path), *args]
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        tail_out = (proc.stdout or "")[-3000:]
        tail_err = (proc.stderr or "")[-1500:]
        return {
            "script": script,
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": tail_out,
            "stderr": tail_err,
        }
    except subprocess.TimeoutExpired:
        return {"script": script, "ok": False, "error": f"超时（>{timeout}s）"}
    except Exception as exc:
        logger.exception("run script failed: %s", script)
        return {"script": script, "ok": False, "error": str(exc)}


def _index_directory(dir_path: Path, source_type: str, *, force: bool = False) -> dict:
    suffixes = {".md", ".txt", ".markdown"}
    if not dir_path.is_dir():
        return {"dir": str(dir_path), "source_type": source_type, "ok": True, "skipped": "missing"}
    files = [p for p in dir_path.rglob("*") if p.is_file() and p.suffix.lower() in suffixes]
    if not files:
        return {"dir": str(dir_path), "source_type": source_type, "ok": True, "skipped": "empty"}
    args = ["--dir", str(dir_path), "--source-type", source_type, "--reuse"]
    if force:
        args.append("--force")
    result = _run_py_script("rag_index.py", *args)
    result["dir"] = str(dir_path)
    result["source_type"] = source_type
    result["file_count"] = len(files)
    return result


def import_rag_sources(*, skip_remote: bool = False) -> dict:
    """拉取公版/中文注释到磁盘（等同 ensure_rag.sh 前半段）。"""
    steps: list[tuple[str, str, list[str]]] = []
    if not skip_remote:
        steps.extend([
            ("helloao", "import_commentary_pd.py", ["--all-sources", "--skip-existing"]),
            ("ocd", "import_commentary_ocd.py", ["--skip-existing"]),
        ])
    steps.append(("zh_content", "build_rag_zh_content.py", []))

    results: list[dict] = []
    ok = True
    for step_id, script, args in steps:
        row = _run_py_script(script, *args)
        row["step"] = step_id
        results.append(row)
        if not row.get("ok"):
            ok = False
    return {"ok": ok, "steps": results}


def index_rag_collections(*, force: bool = False) -> dict:
    """对 commentary 各目录批量向量化（等同 ensure_rag.sh 索引段）。"""
    root = _repo_root()
    comment = root / "content" / "commentary"
    results: list[dict] = []

    singles = [
        (comment / "study-bible", "study-bible"),
        (comment / "public-domain", "commentary"),
        (comment / "reference-en", "reference-en"),
        (comment / "study-bible-zh", "study-bible-zh"),
    ]
    for dir_path, source_type in singles:
        results.append(_index_directory(dir_path, source_type, force=force))

    ocd = comment / "public-domain-ocd"
    if ocd.is_dir():
        subdirs = sorted(p for p in ocd.iterdir() if p.is_dir())
        if subdirs:
            for sub in subdirs:
                results.append(_index_directory(sub, "commentary", force=force))
        else:
            results.append(_index_directory(ocd, "commentary", force=force))

    succeeded = [r for r in results if r.get("ok")]
    return {
        "ok": len(succeeded) > 0,
        "indexed_groups": len(succeeded),
        "steps": results,
    }
