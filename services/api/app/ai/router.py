"""POST /ai/chat — SSE 流式释经。"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from ..auth.session import resolve_user_id, try_get_current_user
from ..config import get_settings
from ..db import get_pool
from .chat import prepare
from .llm import StreamMeta, stream_chat
from .parse_output import extract_sections, split_body_and_followups
from .usage import consume_quota, peek_quota, record_ai_request
from .request_log import log_ai_request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/rag/status")
def rag_status():
    """RAG 可用性自检：返回 LLM/Embedding 是否配置、注释文档与向量块数量、混合权重。

    供产品侧确认「RAG 是否已可用」：documents>0 且 chunks>0 且 embedding_configured
    且 db_ok 时，问答会带出脚注引用；否则降级为纯 LLM 通识作答。
    """
    s = get_settings()
    out = {
        "llm_configured": bool(s.deepseek_api_key),
        "llm_model": s.deepseek_text_model,
        "embedding_configured": bool(s.rag_embedding_api_key),
        "embedding_model": s.rag_embedding_model,
        "hybrid_vector_weight": s.rag_hybrid_vector_weight,
        "hybrid_keyword_weight": s.rag_hybrid_keyword_weight,
        "db_ok": False,
        "documents": 0,
        "chunks": 0,
        "rag_ready": False,
    }
    try:
        pool = get_pool()
        with pool.connection() as conn:
            out["documents"] = conn.execute(
                "SELECT count(*) FROM bible_documents "
                "WHERE source_type IN ('commentary','reference-en','study-bible-zh','commentary-zh')"
            ).fetchone()[0]
            out["chunks"] = conn.execute(
                "SELECT count(*) FROM bible_rag_chunks"
            ).fetchone()[0]
        out["db_ok"] = True
    except Exception as exc:  # DB/pgvector 未就绪
        logger.warning("rag status db unavailable: %s", exc)
        out["error"] = str(exc)
    out["rag_ready"] = bool(
        out["db_ok"]
        and out["chunks"] > 0
        and out["embedding_configured"]
        and out["llm_configured"]
    )
    return out


@router.get("/quota")
def ai_quota(
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
):
    """当日 AI 额度（游客限流；登录用户 limit=0 表示不限）。"""
    settings = get_settings()
    user = resolve_user_id(x_user_id=x_user_id, x_user_code=x_user_code)
    if user:
        return {"used": 0, "limit": 0, "unlimited": True}
    limit = settings.ai_guest_daily_limit
    used, lim = peek_quota(x_guest_id, limit)
    return {"used": used, "limit": lim, "unlimited": False}


class Turn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    ref: str | None = None
    question: str | None = None
    mode: str = "understand"
    scene: str | None = None
    # 多轮上下文（客户端本地持有；local-first，不落服务端）
    history: list[Turn] | None = None
    # 读者本地灵修上下文（最近在读、打卡、笔记等；仅注入 prompt）
    reader_context: dict | None = None
    # surface：入口标识；home_prefill 等会关闭 RAG（见 scenes.NO_RAG_SURFACES）
    scope: str | None = None
    surface: str | None = None
    conversation_id: str | None = None
    knowledge_base_id: str | None = None


class CitationExplainRequest(BaseModel):
    title: str | None = None
    snippet: str
    force: bool = False


@router.get("/knowledge-bases")
def knowledge_bases_list():
    """选库列表 + 浏览用平台文件夹摘要。"""
    from .knowledge_bases import (
        PLATFORM_KB,
        build_platform_description,
        list_knowledge_bases,
        list_topic_folders,
        source_types_for_kb,
    )

    items = list_knowledge_bases()
    folders = list_topic_folders()
    try:
        pool = get_pool()
        with pool.connection() as conn:
            enriched = []
            for f in folders:
                types = source_types_for_kb(f["id"])
                row = conn.execute(
                    "SELECT count(*), max(COALESCE(rag_index_at, created_at)) "
                    "FROM bible_documents WHERE source_type = ANY(%s)",
                    (types,),
                ).fetchone()
                enriched.append(
                    {
                        **f,
                        "document_count": int(row[0] or 0) if row else 0,
                        "updated_at": row[1].isoformat() if row and row[1] else None,
                    }
                )
            folders = enriched
    except Exception as exc:
        logger.warning("knowledge base folder stats unavailable: %s", exc)
        folders = [{**f, "document_count": 0, "updated_at": None} for f in folders]

    total = sum(int(f.get("document_count") or 0) for f in folders)
    description = build_platform_description(total_docs=total, folder_stats=folders)
    return {
        "items": items,
        "platform": {
            "id": PLATFORM_KB["id"],
            "name": PLATFORM_KB["name"],
            "description": description,
            "folders": folders,
            "document_count": total,
        },
    }


@router.get("/knowledge-bases/documents/{document_id}")
def knowledge_base_document_preview(
    document_id: str,
    limit: int = 80,
):
    """公开浏览：资料预览（标题 + chunk 摘录，对齐管理端 RAG 预览信息密度）。"""
    try:
        pool = get_pool()
        with pool.connection() as conn:
            row = conn.execute(
                "SELECT id::text, title, source_type, source_path, status "
                "FROM bible_documents WHERE id = %s::uuid",
                (document_id,),
            ).fetchone()
            if not row:
                return JSONResponse(status_code=404, content={"error": "资料不存在"})
            lim = max(1, min(int(limit), 200))
            chunks = conn.execute(
                "SELECT chunk_index, left(chunk_text, 600), length(chunk_text) "
                "FROM bible_rag_chunks WHERE document_id = %s::uuid "
                "ORDER BY chunk_index LIMIT %s",
                (document_id, lim),
            ).fetchall()
            total = conn.execute(
                "SELECT count(*) FROM bible_rag_chunks WHERE document_id = %s::uuid",
                (document_id,),
            ).fetchone()[0]
        return {
            "id": row[0],
            "title": row[1] or "未命名资料",
            "source_type": row[2],
            "source_path": row[3],
            "status": row[4],
            "total_chunks": int(total or 0),
            "chunks": [
                {
                    "index": int(c[0]),
                    "preview": c[1] or "",
                    "length": int(c[2] or 0),
                }
                for c in chunks
            ],
        }
    except Exception as exc:
        logger.warning("document preview failed: %s", exc)
        return JSONResponse(status_code=500, content={"error": "预览暂不可用"})


@router.get("/knowledge-bases/{kb_id}")
def knowledge_base_detail(
    kb_id: str,
    group: str | None = None,
):
    """知识库详情：平台文件夹 / 专题文件；公版英文注释可按 group 二级分类。"""
    from .knowledge_bases import (
        build_platform_description,
        commentary_group_id,
        commentary_group_label,
        commentary_group_sort_key,
        get_knowledge_base,
        list_topic_folders,
        source_types_for_kb,
    )

    kb = get_knowledge_base(kb_id)
    if not kb:
        return JSONResponse(status_code=404, content={"error": "知识库不存在"})
    types = source_types_for_kb(kb_id)
    docs: list[dict] = []
    folders: list[dict] = []
    updated_at = None
    group_id = (group or "").strip() or None
    group_label = None
    try:
        pool = get_pool()
        with pool.connection() as conn:
            if kb["kind"] == "platform":
                for f in list_topic_folders():
                    ftypes = source_types_for_kb(f["id"])
                    row = conn.execute(
                        "SELECT count(*), max(COALESCE(rag_index_at, created_at)) "
                        "FROM bible_documents WHERE source_type = ANY(%s)",
                        (ftypes,),
                    ).fetchone()
                    folders.append(
                        {
                            **f,
                            "document_count": int(row[0] or 0) if row else 0,
                            "updated_at": (
                                row[1].isoformat() if row and row[1] else None
                            ),
                        }
                    )
                if folders:
                    stamps = [f["updated_at"] for f in folders if f.get("updated_at")]
                    updated_at = max(stamps) if stamps else None
            elif kb_id == "en-commentary" and not group_id:
                # 二级分类：按注释系列分子文件夹
                rows = conn.execute(
                    "SELECT id::text, title, source_type, status, source_path, "
                    "COALESCE(rag_index_at, created_at) AS touched_at "
                    "FROM bible_documents WHERE source_type = ANY(%s) "
                    "ORDER BY title NULLS LAST LIMIT 2000",
                    (types,),
                ).fetchall()
                buckets: dict[str, list] = {}
                for r in rows:
                    gid = commentary_group_id(r[4], r[1])
                    buckets.setdefault(gid, []).append(
                        {
                            "id": r[0],
                            "title": (r[1] or "未命名资料").strip() or "未命名资料",
                            "source_type": r[2],
                            "status": r[3],
                            "source_path": r[4],
                            "created_at": r[5].isoformat() if r[5] else None,
                        }
                    )
                for gid, items in sorted(
                    buckets.items(), key=lambda x: commentary_group_sort_key(x[0])
                ):
                    stamps = [i["created_at"] for i in items if i.get("created_at")]
                    folders.append(
                        {
                            "id": gid,
                            "name": commentary_group_label(gid),
                            "description": f"公版英文注释 · {commentary_group_label(gid)}",
                            "kind": "commentary-group",
                            "document_count": len(items),
                            "updated_at": max(stamps) if stamps else None,
                        }
                    )
                docs = []
                stamps = [
                    f["updated_at"] for f in folders if f.get("updated_at")
                ]
                updated_at = max(stamps) if stamps else None
            else:
                rows = conn.execute(
                    "SELECT id::text, title, source_type, status, source_path, "
                    "COALESCE(rag_index_at, created_at) AS touched_at "
                    "FROM bible_documents WHERE source_type = ANY(%s) "
                    "ORDER BY title NULLS LAST, touched_at DESC NULLS LAST "
                    "LIMIT 2000",
                    (types,),
                ).fetchall()
                for r in rows:
                    item = {
                        "id": r[0],
                        "title": (r[1] or "未命名资料").strip() or "未命名资料",
                        "source_type": r[2],
                        "status": r[3],
                        "source_path": r[4],
                        "created_at": r[5].isoformat() if r[5] else None,
                    }
                    if kb_id == "en-commentary" and group_id:
                        if commentary_group_id(r[4], r[1]) != group_id:
                            continue
                    docs.append(item)
                if kb_id == "en-commentary" and group_id:
                    group_label = commentary_group_label(group_id)
                stamps = [d["created_at"] for d in docs if d.get("created_at")]
                updated_at = max(stamps) if stamps else None
    except Exception as exc:
        logger.warning("knowledge base docs unavailable: %s", exc)

    doc_count = (
        sum(int(f.get("document_count") or 0) for f in folders)
        if folders and not docs
        else len(docs)
    )
    description = kb["description"]
    if kb["kind"] == "platform":
        description = build_platform_description(
            total_docs=doc_count, folder_stats=folders
        )
    elif group_label:
        description = f"{kb['description']} 当前查看：{group_label}。"

    return {
        "id": kb["id"],
        "name": group_label or kb["name"],
        "description": description,
        "kind": kb["kind"],
        "is_default": kb["is_default"],
        "has_subfolders": bool(kb.get("has_subfolders")) and not group_id,
        "group": group_id,
        "group_label": group_label,
        "folders": folders,
        "documents": docs,
        "document_count": doc_count,
        "updated_at": updated_at,
    }


@router.post("/citations/explain")
def citations_explain(body: CitationExplainRequest):
    from .citation_explain import explain_citation_snippet

    return explain_citation_snippet(
        title=body.title or "",
        snippet=body.snippet,
        force=body.force,
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat")
def chat(
    body: ChatRequest,
    x_guest_id: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
):
    settings = get_settings()
    logged_in = try_get_current_user(authorization, x_user_id, x_user_code, cookie)
    if logged_in:
        allowed, used, limit = True, 0, 0
        record_ai_request(x_guest_id, logged_in)
    else:
        allowed, used, limit = consume_quota(x_guest_id, settings.ai_guest_daily_limit)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "error": "今日免费次数已用完，请明日再试",
                "used": used,
                "limit": limit,
            },
        )

    history = [t.model_dump() for t in body.history] if body.history else None
    prep = prepare(
        ref_raw=body.ref,
        question=body.question,
        mode=body.mode,
        scene=body.scene,
        history=history,
        surface=body.surface,
        reader_context=body.reader_context,
        knowledge_base_id=body.knowledge_base_id,
    )

    def gen():
        yield _sse("meta", {**prep["meta"], "quota": {"used": used, "limit": limit}})
        full = []
        scene = prep["meta"].get("scene")
        messages = list(prep["messages"])
        max_tokens = int(prep["max_tokens"])
        try:
            meta = StreamMeta()
            for piece in stream_chat(messages, max_tokens=max_tokens, meta=meta):
                full.append(piece)
                yield _sse("delta", {"text": piece})
            # 动态续写：max_tokens 触顶时再请求一次，避免概要等场景半截结束
            if meta.finish_reason == "length" and full:
                cont_budget = min(max(max_tokens // 2, 256), 800)
                cont_msgs = messages + [
                    {"role": "assistant", "content": "".join(full)},
                    {
                        "role": "user",
                        "content": (
                            "请从上文中断处继续写完剩余内容，不要重复已写部分，"
                            "保持相同 Markdown 结构，自然收束。"
                        ),
                    },
                ]
                cont_meta = StreamMeta()
                for piece in stream_chat(
                    cont_msgs, max_tokens=cont_budget, meta=cont_meta,
                ):
                    full.append(piece)
                    yield _sse("delta", {"text": piece})
                if cont_meta.finish_reason:
                    meta.finish_reason = cont_meta.finish_reason
        except Exception as exc:  # 上游/网络异常 → 友好错误事件
            logger.exception("ai chat stream failed")
            log_ai_request(
                device_id=x_guest_id,
                user_id=logged_in,
                scene=scene,
                mode=body.mode,
                surface=body.surface,
                status="error",
            )
            yield _sse("error", {"message": f"小爱暂时无法回应：{exc}"})
            return
        text = "".join(full)
        body_text, followups = split_body_and_followups(text)
        sections = extract_sections(body_text)
        if followups:
            yield _sse("followups", {"items": followups})
        yield _sse(
            "done",
            {
                "length": len(text),
                "word_count": len(body_text),
                "sections": sections,
                "followups": followups,
            },
        )
        log_ai_request(
            device_id=x_guest_id,
            user_id=logged_in,
            scene=scene,
            mode=body.mode,
            surface=body.surface,
            status="ok",
        )

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
