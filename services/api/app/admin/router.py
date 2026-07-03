"""管理员 API：登录 + RAG 资料管理。"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..ai.router import rag_status
from ..config import get_settings
from ..db import get_pool
from ..rag.index import index_text
from .auth import make_admin_token, require_admin, verify_admin_credentials

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

_ALLOWED_SUFFIX = {".md", ".txt", ".markdown"}


class AdminLoginBody(BaseModel):
    phone: str
    password: str


@router.post("/auth/login")
def admin_login(body: AdminLoginBody) -> dict:
    if not verify_admin_credentials(body.phone, body.password):
        raise HTTPException(status_code=401, detail="管理员账号或密码错误")
    token = make_admin_token(body.phone)
    return {"ok": True, "token": token, "phone": body.phone.strip()}


@router.get("/auth/me")
def admin_me(_phone: str = Depends(require_admin)) -> dict:
    return {"ok": True, "is_admin": True}


def _list_documents() -> list[dict]:
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            """
            SELECT d.id, d.title, d.source_type, d.status, d.source_path,
                   d.rag_index_at, d.created_at, d.rag_index_error,
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
            "created_at": r[6].isoformat() if r[6] else None,
            "rag_index_error": r[7],
            "chunks": r[8] or 0,
        })
    return out


@router.get("/rag/status")
def admin_rag_status(_phone: str = Depends(require_admin)) -> dict:
    base = rag_status()
    base["documents_detail"] = _list_documents()
    return base


@router.get("/rag/documents")
def admin_list_documents(_phone: str = Depends(require_admin)) -> dict:
    return {"documents": _list_documents()}


@router.post("/rag/documents")
async def admin_upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    source_type: str = Form("commentary"),
    book_id: str | None = Form(None),
    _phone: str = Depends(require_admin),
) -> dict:
    doc_title = (title or "").strip()
    if not doc_title:
        raise HTTPException(status_code=400, detail="请填写资料标题")
    filename = (file.filename or "upload.md").strip()
    suffix = Path(filename).suffix.lower()
    if suffix not in _ALLOW_SUFFIX:
        raise HTTPException(status_code=400, detail="仅支持 .md / .txt 文件")

    raw = await file.read()
    try:
        body = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="文件须为 UTF-8 编码") from exc
    if not body.strip():
        raise HTTPException(status_code=400, detail="文件内容为空")

    settings = get_settings()
    upload_dir = Path(settings.rag_upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex[:12]}_{Path(filename).name}"
    dest = upload_dir / safe_name
    dest.write_text(body, encoding="utf-8")

    try:
        result = index_text(
            title=doc_title,
            source_path=str(dest),
            source_type=(source_type or "commentary").strip(),
            body=body,
            force=True,
            book_id=(book_id or "").strip().upper() or None,
        )
    except Exception as exc:
        logger.exception("admin rag upload index failed")
        raise HTTPException(status_code=500, detail=f"索引失败：{exc}") from exc

    docs = _list_documents()
    matched = next((d for d in docs if d["source_path"] == str(dest)), None)
    return {"ok": True, "index": result, "document": matched}


@router.delete("/rag/documents/{document_id}")
def admin_delete_document(document_id: str, _phone: str = Depends(require_admin)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, source_path FROM bible_documents WHERE id = %s::uuid",
            (document_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="资料不存在")
        conn.execute("DELETE FROM bible_documents WHERE id = %s::uuid", (document_id,))
        conn.commit()
        source_path = row[1]
    if source_path:
        try:
            p = Path(source_path)
            if p.is_file() and "rag/uploads" in str(p):
                p.unlink(missing_ok=True)
        except OSError:
            logger.warning("failed to remove upload file %s", source_path)
    return {"ok": True, "deleted": document_id}


@router.post("/rag/documents/{document_id}/reindex")
def admin_reindex_document(document_id: str, _phone: str = Depends(require_admin)) -> dict:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT title, source_type, source_path FROM bible_documents WHERE id = %s::uuid",
            (document_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="资料不存在")
    title, source_type, source_path = row
    if not source_path or not Path(source_path).is_file():
        raise HTTPException(status_code=400, detail="源文件不存在，请重新上传")
    body = Path(source_path).read_text(encoding="utf-8")
    result = index_text(
        title=title,
        source_path=source_path,
        source_type=source_type,
        body=body,
        force=True,
    )
    return {"ok": True, "index": result}
