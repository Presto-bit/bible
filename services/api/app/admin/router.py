"""管理员 API：登录 + RAG 资料管理。"""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from datetime import date, timedelta

from ..ai.router import rag_status
from ..auth.session import get_current_user
from ..config import get_settings
from ..db import get_pool
from ..rag.index import index_file
from .auth import make_admin_token, phone_is_admin, require_admin, verify_admin_credentials
from .rag_inventory import build_rag_inventory, purge_rag_orphans
from .rag_ops import (
    import_rag_sources,
    index_pending_disk,
    index_pending_uploads,
    index_rag_collections,
    index_upload_path,
    list_pending_uploads,
    upload_dir,
)
from .rag_workspace import (
    build_workspace_tree,
    create_workspace_file,
    delete_workspace_path,
    index_workspace_file,
    list_document_chunks,
    mkdir_workspace,
    read_workspace_file,
    rename_or_move_workspace,
    save_workspace_file,
)
from .hero_b_ops import (
    delete_campaign,
    get_campaign,
    list_campaigns,
    upload_hero_image,
    upsert_campaign,
)
from ..content.hero_b_link import LINK_CATALOG, resolve_hero_b_href, HeroBLinkError
from .stats_ops import STATS_DETAIL_METRICS, fetch_admin_stats, fetch_admin_stats_detail

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

_ALLOWED_SUFFIX = {".md", ".txt", ".markdown"}


class AdminLoginBody(BaseModel):
    phone: str
    password: str


class IndexUploadBody(BaseModel):
    title: str | None = None
    source_type: str = "commentary"
    force: bool = True


class IndexPendingBody(BaseModel):
    source_type: str = "commentary"
    force: bool = True
    collection_id: str | None = None
    limit: int | None = 8


class RagImportBody(BaseModel):
    skip_remote: bool = False


class RagIndexCollectionsBody(BaseModel):
    force: bool = False


@router.post("/auth/login")
def admin_login(body: AdminLoginBody) -> dict:
    if not verify_admin_credentials(body.phone, body.password):
        raise HTTPException(status_code=401, detail="管理员账号或密码错误")
    token = make_admin_token(body.phone)
    return {"ok": True, "token": token, "phone": body.phone.strip()}


@router.get("/auth/me")
def admin_me(_phone: str = Depends(require_admin)) -> dict:
    return {"ok": True, "is_admin": True}


def _lookup_user_phone(user_id: str) -> str | None:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT phone FROM accounts WHERE user_id = %s::uuid AND phone IS NOT NULL LIMIT 1",
            (user_id,),
        ).fetchone()
    return row[0] if row else None


@router.get("/auth/eligible")
def admin_eligible(user_id: str = Depends(get_current_user)) -> dict:
    phone = _lookup_user_phone(user_id)
    return {"admin_eligible": phone_is_admin(phone)}


@router.get("/stats")
def admin_stats(
    days: int = Query(7, ge=1, le=90),
    _phone: str = Depends(require_admin),
) -> dict:
    try:
        return fetch_admin_stats(series_days=days)
    except Exception as exc:
        logger.exception("admin stats failed")
        raise HTTPException(status_code=503, detail=f"统计数据不可用：{exc}") from exc


@router.get("/stats/detail/{metric}")
def admin_stats_detail(
    metric: str,
    limit: int = Query(50, ge=1, le=200),
    preset: str | None = Query(None, pattern="^(today|7d|30d|custom)$"),
    days: int | None = Query(None, ge=1, le=90),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    _phone: str = Depends(require_admin),
) -> dict:
    if metric not in STATS_DETAIL_METRICS:
        raise HTTPException(status_code=404, detail="未知指标")
    try:
        return fetch_admin_stats_detail(
            metric,
            limit=limit,
            preset=preset,
            days=days,
            date_from=date_from,
            date_to=date_to,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("admin stats detail failed metric=%s", metric)
        raise HTTPException(status_code=503, detail=f"明细不可用：{exc}") from exc




def _format_index_message(result: dict) -> str:
    if result.get("skipped"):
        reason = result.get("reason") or "unchanged"
        return f"内容未变化，已跳过（{reason}）"
    chunks = int(result.get("chunks") or 0)
    reused = int(result.get("reused") or 0)
    backend = result.get("backend") or "embedding"
    if reused > 0:
        return f"已向量化 {chunks} 块（复用 {reused} 块，{backend}）"
    return f"已向量化 {chunks} 块（{backend}）"


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


@router.get("/rag/inventory")
def admin_rag_inventory(_phone: str = Depends(require_admin)) -> dict:
    try:
        return build_rag_inventory()
    except Exception as exc:
        logger.exception("admin rag inventory failed")
        raise HTTPException(status_code=503, detail=f"资料清单不可用：{exc}") from exc


@router.post("/rag/orphans/purge")
def admin_purge_rag_orphans(_phone: str = Depends(require_admin)) -> dict:
    """一键删除孤儿文档（仅库、磁盘无对应文件）。"""
    try:
        return purge_rag_orphans()
    except Exception as exc:
        logger.exception("admin purge rag orphans failed")
        raise HTTPException(status_code=500, detail=f"清除孤儿文档失败：{exc}") from exc


@router.get("/rag/documents")
def admin_list_documents(_phone: str = Depends(require_admin)) -> dict:
    return {"documents": _list_documents()}


@router.get("/rag/uploads/pending")
def admin_list_pending_uploads(_phone: str = Depends(require_admin)) -> dict:
    try:
        pending = list_pending_uploads()
    except Exception as exc:
        logger.exception("admin list pending uploads failed")
        raise HTTPException(status_code=503, detail=f"待索引列表不可用：{exc}") from exc
    return {"pending": pending, "count": len(pending)}


@router.post("/rag/uploads/index-pending")
def admin_index_pending_uploads(
    body: IndexPendingBody | None = None,
    _phone: str = Depends(require_admin),
) -> dict:
    opts = body or IndexPendingBody()
    try:
        result = index_pending_uploads(
            source_type=(opts.source_type or "commentary").strip(),
            force=opts.force,
        )
    except Exception as exc:
        logger.exception("admin index pending uploads failed")
        raise HTTPException(status_code=500, detail=f"批量向量化失败：{exc}") from exc
    return {"ok": True, **result}


@router.post("/rag/import-sources")
def admin_rag_import_sources(
    body: RagImportBody | None = None,
    _phone: str = Depends(require_admin),
) -> dict:
    """从公网拉取注释 + 生成中文 RAG 资料（发版后由管理员手动触发）。"""
    opts = body or RagImportBody()
    try:
        result = import_rag_sources(skip_remote=opts.skip_remote)
    except Exception as exc:
        logger.exception("admin rag import sources failed")
        raise HTTPException(status_code=500, detail=f"拉取失败：{exc}") from exc
    return {"ok": bool(result.get("ok")), **result}


@router.post("/rag/index-collections")
def admin_rag_index_collections(
    body: RagIndexCollectionsBody | None = None,
    _phone: str = Depends(require_admin),
) -> dict:
    """对 commentary 目录批量向量化（等同 ensure_rag 索引段）。"""
    opts = body or RagIndexCollectionsBody()
    try:
        result = index_rag_collections(force=opts.force)
    except Exception as exc:
        logger.exception("admin rag index collections failed")
        raise HTTPException(status_code=500, detail=f"索引失败：{exc}") from exc
    return {"ok": bool(result.get("ok")), **result}


@router.post("/rag/index-pending-disk")
def admin_index_pending_disk(
    body: IndexPendingBody | None = None,
    _phone: str = Depends(require_admin),
) -> dict:
    """对资料清单中所有待索引/失败的磁盘文件批量向量化（含公版注释等）。"""
    opts = body or IndexPendingBody()
    try:
        result = index_pending_disk(
            collection_id=opts.collection_id,
            force=opts.force,
            limit=opts.limit,
        )
    except Exception as exc:
        logger.exception("admin index pending disk failed")
        raise HTTPException(status_code=500, detail=f"批量向量化失败：{exc}") from exc
    return {"ok": True, **result}


@router.post("/rag/uploads/{filename}/index")
def admin_index_upload_file(
    filename: str,
    body: IndexUploadBody | None = None,
    _phone: str = Depends(require_admin),
) -> dict:
    safe = Path(filename).name
    if safe != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="非法文件名")
    opts = body or IndexUploadBody()
    dest = upload_dir() / safe
    if not dest.is_file():
        raise HTTPException(status_code=404, detail="上传文件不存在")
    try:
        index_result = index_upload_path(
            dest,
            title=(opts.title or "").strip() or None,
            source_type=(opts.source_type or "commentary").strip(),
            force=opts.force,
        )
    except Exception as exc:
        logger.exception("admin index upload file failed")
        raise HTTPException(status_code=500, detail=f"向量化失败：{exc}") from exc
    docs = _list_documents()
    matched = next(
        (d for d in docs if d.get("source_path") and Path(d["source_path"]).name == safe),
        None,
    )
    return {"ok": True, "index": index_result, "document": matched}


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
    upload_dir_path = Path(settings.rag_upload_dir)
    upload_dir_path.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex[:12]}_{Path(filename).name}"
    dest = (upload_dir_path / safe_name).resolve()
    dest.write_text(body, encoding="utf-8")

    st = (source_type or "commentary").strip()
    bid = (book_id or "").strip().upper() or None
    try:
        result = index_file(
            dest,
            source_type=st,
            title=doc_title,
            book_id=bid,
            force=True,
        )
    except Exception as exc:
        logger.exception("admin rag upload index failed")
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"向量化失败：{exc}") from exc

    docs = _list_documents()
    matched = next(
        (d for d in docs if d.get("source_path") == str(dest)),
        None,
    )
    if matched is None:
        matched = next(
            (d for d in docs if d.get("source_path") and Path(d["source_path"]).name == safe_name),
            None,
        )
    return {
        "ok": True,
        "filename": safe_name,
        "index": result,
        "document": matched,
        "message": _format_index_message(result),
    }


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
    try:
        result = index_file(
            Path(source_path),
            source_type=source_type,
            title=title,
            force=True,
        )
    except Exception as exc:
        logger.exception("admin reindex failed")
        raise HTTPException(status_code=500, detail=f"重建索引失败：{exc}") from exc
    return {"ok": True, "index": result, "message": _format_index_message(result)}


class RagRenameBody(BaseModel):
    title: str


@router.patch("/rag/documents/{document_id}")
def admin_rename_document(
    document_id: str,
    body: RagRenameBody,
    _phone: str = Depends(require_admin),
) -> dict:
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="标题不能为空")
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "UPDATE bible_documents SET title = %s, updated_at = NOW() WHERE id = %s::uuid RETURNING id, title",
            (title, document_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="资料不存在")
        conn.commit()
    return {"ok": True, "id": str(row[0]), "title": row[1]}


# ── RAG 工作台（PC 文件树 / 预览编辑）──


class WorkspacePathBody(BaseModel):
    collection_id: str
    path: str


class WorkspaceSaveBody(BaseModel):
    collection_id: str
    path: str
    content: str


class WorkspaceCreateFileBody(BaseModel):
    collection_id: str
    path: str
    content: str | None = None


class WorkspaceMoveBody(BaseModel):
    collection_id: str
    from_path: str
    to_path: str
    to_collection_id: str | None = None


class WorkspaceDeleteBody(BaseModel):
    collection_id: str
    path: str
    purge_db: bool = True


class WorkspaceIndexBody(BaseModel):
    collection_id: str
    path: str
    force: bool = True


@router.get("/rag/workspace/tree")
def admin_rag_workspace_tree(_phone: str = Depends(require_admin)) -> dict:
    try:
        return build_workspace_tree()
    except Exception as exc:
        logger.exception("workspace tree failed")
        raise HTTPException(status_code=500, detail=f"加载文件树失败：{exc}") from exc


@router.get("/rag/workspace/file")
def admin_rag_workspace_file(
    collection_id: str = Query(...),
    path: str = Query(...),
    _phone: str = Depends(require_admin),
) -> dict:
    return read_workspace_file(collection_id=collection_id, path=path)


@router.put("/rag/workspace/file")
def admin_rag_workspace_save(
    body: WorkspaceSaveBody,
    _phone: str = Depends(require_admin),
) -> dict:
    return save_workspace_file(
        collection_id=body.collection_id,
        path=body.path,
        content=body.content,
    )


@router.post("/rag/workspace/mkdir")
def admin_rag_workspace_mkdir(
    body: WorkspacePathBody,
    _phone: str = Depends(require_admin),
) -> dict:
    return mkdir_workspace(collection_id=body.collection_id, path=body.path)


@router.post("/rag/workspace/create-file")
def admin_rag_workspace_create_file(
    body: WorkspaceCreateFileBody,
    _phone: str = Depends(require_admin),
) -> dict:
    return create_workspace_file(
        collection_id=body.collection_id,
        path=body.path,
        content=body.content,
    )


@router.post("/rag/workspace/move")
def admin_rag_workspace_move(
    body: WorkspaceMoveBody,
    _phone: str = Depends(require_admin),
) -> dict:
    return rename_or_move_workspace(
        collection_id=body.collection_id,
        from_path=body.from_path,
        to_path=body.to_path,
        to_collection_id=body.to_collection_id,
    )


@router.post("/rag/workspace/delete")
def admin_rag_workspace_delete(
    body: WorkspaceDeleteBody,
    _phone: str = Depends(require_admin),
) -> dict:
    return delete_workspace_path(
        collection_id=body.collection_id,
        path=body.path,
        purge_db=body.purge_db,
    )


@router.post("/rag/workspace/index")
def admin_rag_workspace_index(
    body: WorkspaceIndexBody,
    _phone: str = Depends(require_admin),
) -> dict:
    return index_workspace_file(
        collection_id=body.collection_id,
        path=body.path,
        force=body.force,
    )


@router.get("/rag/workspace/chunks")
def admin_rag_workspace_chunks(
    document_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
    _phone: str = Depends(require_admin),
) -> dict:
    return list_document_chunks(document_id, limit=limit)


# ── 运营：首页 Hero B ──


class HeroBCampaignBody(BaseModel):
    id: str
    name: str
    enabled: bool = True
    status: str = "draft"
    priority: int = 0
    startAt: str
    endAt: str
    imageUrl: str
    imageUrlDark: str | None = None
    imageVersion: int = 1
    alt: str
    badge: str | None = None
    link: dict
    audience: str = "all"


class HeroBLinkPreviewBody(BaseModel):
    link: dict


@router.get("/ops/hero-b")
def admin_list_hero_b(_phone: str = Depends(require_admin)) -> dict:
    try:
        items = list_campaigns()
    except Exception as exc:
        logger.exception("list hero b campaigns failed")
        raise HTTPException(status_code=503, detail="活动列表暂不可用") from exc
    return {"campaigns": items}


@router.get("/ops/hero-b/link-catalog")
def admin_hero_b_link_catalog(_phone: str = Depends(require_admin)) -> dict:
    return {"catalog": LINK_CATALOG}


@router.get("/ops/hero-b/preview-url")
def admin_hero_b_preview_url(
    campaign_id: str = Query(...),
    _phone: str = Depends(require_admin),
) -> dict:
    """真机预览：带 preview_campaign_id 的首页 bootstrap。"""
    return {
        "previewPath": f"/content/home/bootstrap?preview_campaign_id={campaign_id}",
        "hint": "在已登录管理员的 App 中请求该接口并打开首页查看 Hero B",
    }


@router.get("/ops/hero-b/{campaign_id}")
def admin_get_hero_b(campaign_id: str, _phone: str = Depends(require_admin)) -> dict:
    item = get_campaign(campaign_id)
    if not item:
        raise HTTPException(status_code=404, detail="活动不存在")
    return {"campaign": item}


@router.post("/ops/hero-b")
def admin_create_hero_b(body: HeroBCampaignBody, _phone: str = Depends(require_admin)) -> dict:
    try:
        saved = upsert_campaign(body.model_dump(), is_new=True)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("create hero b campaign failed")
        raise HTTPException(status_code=503, detail="创建失败") from exc
    return {"campaign": saved}


@router.put("/ops/hero-b/{campaign_id}")
def admin_update_hero_b(
    campaign_id: str,
    body: HeroBCampaignBody,
    _phone: str = Depends(require_admin),
) -> dict:
    if body.id != campaign_id:
        raise HTTPException(status_code=400, detail="id 不一致")
    try:
        saved = upsert_campaign(body.model_dump(), is_new=False)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("update hero b campaign failed")
        raise HTTPException(status_code=503, detail="更新失败") from exc
    return {"campaign": saved}


@router.delete("/ops/hero-b/{campaign_id}")
def admin_delete_hero_b(campaign_id: str, _phone: str = Depends(require_admin)) -> dict:
    try:
        delete_campaign(campaign_id)
    except Exception as exc:
        logger.exception("delete hero b campaign failed")
        raise HTTPException(status_code=503, detail="删除失败") from exc
    return {"ok": True}


@router.post("/ops/hero-b/upload")
async def admin_upload_hero_b_image(
    file: UploadFile = File(...),
    campaign_id: str | None = Form(None),
    _phone: str = Depends(require_admin),
) -> dict:
    try:
        return await upload_hero_image(file, campaign_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("hero b upload failed")
        raise HTTPException(status_code=500, detail="上传失败") from exc


@router.post("/ops/hero-b/resolve-link")
def admin_resolve_hero_b_link(
    body: HeroBLinkPreviewBody,
    _phone: str = Depends(require_admin),
) -> dict:
    try:
        href = resolve_hero_b_href(body.link)
    except HeroBLinkError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"href": href}


class ModerationResolveBody(BaseModel):
    status: str
    note: str | None = None


@router.get("/moderation/cases")
def admin_list_moderation_cases(
    status: str = Query("open"),
    limit: int = Query(50, ge=1, le=200),
    _phone: str = Depends(require_admin),
) -> dict:
    """审核工单列表（含证据快照）。"""
    st = status if status in ("open", "actioned", "dismissed", "all") else "open"
    pool = get_pool()
    with pool.connection() as conn:
        if st == "all":
            rows = conn.execute(
                """
                SELECT c.id, c.reporter_id, c.target_type, c.target_id, c.reason,
                       c.status, c.created_at, c.resolved_at, c.resolution_note,
                       s.payload
                FROM moderation_case c
                LEFT JOIN LATERAL (
                  SELECT payload FROM moderation_snapshot
                  WHERE case_id = c.id ORDER BY created_at DESC LIMIT 1
                ) s ON true
                ORDER BY c.created_at DESC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT c.id, c.reporter_id, c.target_type, c.target_id, c.reason,
                       c.status, c.created_at, c.resolved_at, c.resolution_note,
                       s.payload
                FROM moderation_case c
                LEFT JOIN LATERAL (
                  SELECT payload FROM moderation_snapshot
                  WHERE case_id = c.id ORDER BY created_at DESC LIMIT 1
                ) s ON true
                WHERE c.status = %s
                ORDER BY c.created_at DESC
                LIMIT %s
                """,
                (st, limit),
            ).fetchall()
    items = []
    for r in rows:
        payload = r[9] if len(r) > 9 else {}
        if isinstance(payload, str):
            try:
                import json as _json
                payload = _json.loads(payload)
            except Exception:
                payload = {"raw": payload}
        items.append({
            "id": str(r[0]),
            "reporter_id": str(r[1]) if r[1] else None,
            "target_type": r[2],
            "target_id": r[3],
            "reason": r[4],
            "status": r[5],
            "created_at": r[6].isoformat() if r[6] else None,
            "resolved_at": r[7].isoformat() if r[7] else None,
            "resolution_note": r[8],
            "snapshot": payload or {},
        })
    return {"items": items}


@router.patch("/moderation/cases/{case_id}")
def admin_resolve_moderation_case(
    case_id: str,
    body: ModerationResolveBody,
    _phone: str = Depends(require_admin),
) -> dict:
    if body.status not in ("actioned", "dismissed", "open"):
        raise HTTPException(400, "无效 status")
    note = (body.note or "").strip()[:2000] or None
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id FROM moderation_case WHERE id = %s",
            (case_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "工单不存在")
        if body.status == "open":
            conn.execute(
                "UPDATE moderation_case SET status = 'open', resolved_at = NULL, "
                "resolution_note = %s WHERE id = %s",
                (note, case_id),
            )
        else:
            conn.execute(
                "UPDATE moderation_case SET status = %s, resolved_at = now(), "
                "resolution_note = %s WHERE id = %s",
                (body.status, note, case_id),
            )
        conn.commit()
    return {"ok": True, "id": case_id, "status": body.status}

