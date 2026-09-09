"""POST /ai/chat — SSE 流式释经。"""
from __future__ import annotations

import json
import logging
import threading
import time

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from ..auth.session import resolve_user_id, try_get_current_user
from ..config import get_settings
from ..db import get_pool
from .chat import prepare
from .answer_document import build_done_sse_payload, document_from_cache_entry
from .answer_normalize import normalize_answer_markdown
from .output_plan import build_output_plan, depth_kwargs_from_plan
from .answer_schema import SCHEMA_VERSION
from .conversation_store import (
    append_turns,
    find_resumable_conversation,
    history_for_prompt,
    merge_client_history,
    _history_tail_aligned,
    open_conversation,
)
from .idempotency import claim_idempotency
from .section_fill import section_fill_once
from .section_stream import SectionStreamTracker, iter_replay_stream
from .answer_structured import (
    recover_empty_response,
    recover_incomplete_verse_answer,
    try_structured_verse_answer,
)
from .llm import StreamMeta, complete_chat, stream_chat
from .parse_output import (
    answer_ends_abruptly,
    answer_marked_incomplete,
    extract_sections,
    merge_continuation_sections,
    mid_bullet_truncated,
    split_body_and_followups,
    verse_explain_incomplete,
    verse_needs_length_continuation,
)
from .usage import consume_quota, peek_quota, record_ai_request
from .request_log import log_ai_request
from .perf_log import record_ai_perf_marks

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


class PerfMarkBody(BaseModel):
    name: str
    ms: int
    detail: dict | None = None


class PerfBatchBody(BaseModel):
    marks: list[PerfMarkBody]

# 单次 /ai/chat 内所有 LLM 调用的总 wall-clock 上限（秒）；与客户端 sceneTimeout 上限对齐
_LLM_WALL_BUDGET_SEC = 120.0

_PREWARM_POOL = None


def _prewarm_pool():
    global _PREWARM_POOL
    if _PREWARM_POOL is None:
        from concurrent.futures import ThreadPoolExecutor

        _PREWARM_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="rag-prewarm")
    return _PREWARM_POOL


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
                "WHERE source_type IN ('commentary','commentary-zh','study-bible')"
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


def _is_android_native_client(
    *,
    x_client_kind: str | None = None,
    surface: str | None = None,
) -> bool:
    """Flutter 安卓原生壳：产品侧不套用游客日限。"""
    kind = (x_client_kind or "").strip().lower()
    if kind in (
        "android_flutter",
        "flutter_android",
        "native_android",
        "android",
    ):
        return True
    return (surface or "").strip().lower() == "mobile"


@router.get("/quota")
def ai_quota(
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_client_kind: str | None = Header(default=None, alias="X-Client-Kind"),
    authorization: str | None = Header(default=None),
    cookie: str | None = Header(default=None),
):
    """当日 AI 额度（游客限流；登录用户 / 安卓原生 limit=0 表示不限）。"""
    settings = get_settings()
    user = resolve_user_id(
        authorization=authorization,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    if user or _is_android_native_client(x_client_kind=x_client_kind):
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
    client_capabilities: dict | None = None


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
def knowledge_base_document_preview(document_id: str):
    """公开浏览：资料原文预览（读源 Markdown/文本，非 RAG chunk）。"""
    from .knowledge_bases import read_document_source_text

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
        source = read_document_source_text(row[3])
        if source.get("error") and not source.get("content"):
            return JSONResponse(
                status_code=404,
                content={"error": source["error"]},
            )
        return {
            "id": row[0],
            "title": row[1] or "未命名资料",
            "source_type": row[2],
            "source_path": row[3],
            "status": row[4],
            "content": source.get("content") or "",
            "truncated": bool(source.get("truncated")),
            "size_bytes": source.get("size_bytes"),
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


class AnalysisShareCreate(BaseModel):
    ref_label: str | None = None
    ref_param: str | None = None
    answer_markdown: str
    lead: str | None = None
    citations: list[dict] | None = None


@router.post("/analysis-share")
def analysis_share_create(
    body: AnalysisShareCreate,
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    """创建解读分享快照（完整回答 + 来源），返回可跨设备打开的 id。"""
    from fastapi import HTTPException

    from .analysis_share import create_snapshot

    try:
        snap = create_snapshot(
            ref_label=body.ref_label or "小爱的解读",
            ref_param=body.ref_param or "",
            answer_markdown=body.answer_markdown,
            lead=body.lead or "",
            citations=body.citations,
            creator_code=x_user_code or x_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("analysis share create failed")
        raise HTTPException(status_code=500, detail="分享快照创建失败") from exc
    return {
        "id": snap["id"],
        "path": f"/share/analysis/{snap['id']}",
        "lead": snap["lead"],
        "ref_label": snap["ref_label"],
        "expires_at": snap.get("expires_at"),
    }


@router.get("/analysis-share/{snapshot_id}")
def analysis_share_get(snapshot_id: str):
    from fastapi import HTTPException

    from .analysis_share import get_snapshot

    snap = get_snapshot(snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="分享不存在或已过期")
    return snap


@router.post("/citations/explain")
def citations_explain(body: CitationExplainRequest):
    from .citation_explain import explain_citation_snippet

    return explain_citation_snippet(
        title=body.title or "",
        snippet=body.snippet,
        force=body.force,
    )


@router.post("/perf")
def record_assistant_perf(
    body: PerfBatchBody,
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
):
    """客户端 RUM：小爱流式关键路径耗时 batch 入库。"""
    logged_in = try_get_current_user(authorization, x_user_id, x_user_code, cookie)
    user_id_str = str(logged_in) if logged_in else None
    return record_ai_perf_marks(
        marks=[m.model_dump() for m in body.marks],
        device_id=x_guest_id,
        user_id=user_id_str,
    )


class PrewarmRequest(BaseModel):
    ref: str
    mode: str = "explain"
    scene: str | None = "verse_quick"


class WarmRequest(BaseModel):
    ref: str | None = None
    question: str | None = None


@router.post("/warm")
def warm_llm_connection(
    body: WarmRequest | None = None,
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
):
    """半屏打开时预热 LLM 连接 + RAG 检索缓存（非答案缓存）。"""
    from ..bible.refs import parse_ref
    from ..rag.retrieval_warm import warm_retrieval_for_chat
    from .llm import warm_connection

    _ = x_guest_id
    req = body or WarmRequest()
    ok = warm_connection()
    ref_raw = (req.ref or "").strip()
    if ref_raw:
        parsed = parse_ref(ref_raw)
        if parsed:

            def _warm_rag() -> None:
                warm_retrieval_for_chat(parsed, question=req.question)

            _prewarm_pool().submit(_warm_rag)
    return {
        "status": "ok" if ok else "skipped",
        "retrieval": "warming" if ref_raw else "skipped",
    }


@router.post("/prewarm")
def prewarm_answer(
    body: PrewarmRequest,
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
):
    """读经进入经节时静默预生成「解释这节」首答，写入答案缓存。"""
    from ..bible.refs import parse_ref
    from ..rag.answer_cache import cache_key, get_answer, put_answer
    from .answer_normalize import normalize_answer_markdown
    from .answer_schema import SCHEMA_VERSION
    from .llm import complete_chat
    from .parse_output import extract_sections, split_body_and_followups

    from .prewarm_limit import allow_prewarm

    settings = get_settings()
    if not settings.rag_prewarm_on_read:
        return {"status": "disabled"}
    if not allow_prewarm(x_guest_id):
        return JSONResponse(
            status_code=429,
            content={"error": "prewarm 过于频繁，请稍后再试"},
        )
    ref_raw = (body.ref or "").strip()
    if not ref_raw:
        return JSONResponse(status_code=400, content={"error": "缺少经节"})
    parsed = parse_ref(ref_raw)
    if not parsed or parsed.chapter is None or parsed.verse_start is None:
        return JSONResponse(status_code=400, content={"error": "经节无效"})
    mode = (body.mode or "explain").strip() or "explain"
    scene = (body.scene or "verse_quick").strip() or "verse_quick"
    question = f"请解读：{parsed.display}"
    key = cache_key(
        ref=ref_raw,
        mode=mode,
        question=question,
        scene=scene,
        verse_span=1,
    )

    def _warm_retrieval() -> None:
        from ..rag.retrieval_warm import warm_retrieval_for_ref

        warm_retrieval_for_ref(parsed)

    _prewarm_pool().submit(_warm_retrieval)
    if get_answer(key):
        return {"status": "hit", "cache_source": "cache"}

    def _warm() -> None:
        try:
            prep = prepare(
                ref_raw=ref_raw,
                question=question,
                mode=mode,
                scene=scene,
                history=None,
                surface="prewarm",
                reader_context=None,
                knowledge_base_id=None,
            )
            scene_id = prep["meta"].get("scene") or scene
            verse_span = int(prep["meta"].get("verse_span") or 1)
            structured = try_structured_verse_answer(
                prep["messages"],
                scene_id,
                max_tokens=int(prep["max_tokens"]),
                verse_span=verse_span,
            )
            if structured:
                text = structured
            else:
                text = complete_chat(prep["messages"], max_tokens=int(prep["max_tokens"]))
            _meta = prep["meta"]
            _plan = _meta.get("output_plan") or {}
            _dk = depth_kwargs_from_plan(_plan)
            _depth = _meta.get("depth") or _dk.get("depth")
            text = normalize_answer_markdown(
                text,
                scene_id,
                narrow=bool(_meta.get("narrow")),
                verse_span=verse_span,
                depth=_depth,
                soft_max=_dk.get("soft_max"),
                prefer_prose=bool(_dk.get("prefer_prose")),
            )
            body_text, followups = split_body_and_followups(text)
            if (
                scene_id in ("verse_full", "verse_quick")
                and verse_explain_incomplete(
                    scene_id,
                    body_text,
                    verse_span=verse_span,
                    depth=_depth,
                    expected_sections=_dk.get("expected_sections"),
                    min_complete=_dk.get("min_complete"),
                )
            ):
                return
            sections = extract_sections(body_text)
            document = document_from_cache_entry(body_text, followups=followups, sections=sections)
            put_answer(
                key,
                {
                    "answer": body_text,
                    "followups": followups,
                    "sections": document["sections"],
                    "document": document,
                    "meta": {
                        **prep["meta"],
                        "schema_version": SCHEMA_VERSION,
                        "cache_hit": True,
                        "cache_source": "prewarm",
                        "instant": True,
                    },
                    "source": "prewarm",
                },
            )
        except Exception:
            logger.exception("ai prewarm failed ref=%s", ref_raw)

    _prewarm_pool().submit(_warm)
    return {"status": "warming"}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _sse_comment(tag: str = "hb") -> str:
    return f": {tag}\n\n"


@router.post("/chat")
def chat(
    body: ChatRequest,
    x_guest_id: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
    x_client_kind: str | None = Header(default=None, alias="X-Client-Kind"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    from ..rag.answer_cache import (
        cache_key,
        cache_suitable_for_request,
        get_answer,
        put_answer,
        verse_span_from_ref,
    )

    settings = get_settings()
    logged_in = try_get_current_user(authorization, x_user_id, x_user_code, cookie)
    user_id_str = str(logged_in) if logged_in else None
    client_history = [t.model_dump() for t in body.history] if body.history else None
    resume_id: str | None = None
    if (
        not body.conversation_id
        and not client_history
        and user_id_str
        and (body.ref or "").strip()
    ):
        resume_id = find_resumable_conversation(
            user_id=user_id_str,
            ref=(body.ref or ""),
            mode=body.mode or "explain",
            scene=body.scene or "",
        )
    conv_seed = body.conversation_id or resume_id
    if conv_seed and client_history:
        server_hist = history_for_prompt(conv_seed)
        if server_hist and not _history_tail_aligned(server_hist, client_history):
            logger.warning(
                "ai chat conversation history mismatch conv=%s client_turns=%s server_turns=%s",
                conv_seed,
                len(client_history),
                len(server_hist),
            )
            conv_seed = None
    conversation_id = open_conversation(
        conv_seed,
        guest_id=x_guest_id,
        user_id=user_id_str,
        ref=(body.ref or ""),
        mode=body.mode,
        scene=body.scene or "",
    )
    merged_history = merge_client_history(
        history_for_prompt(conversation_id),
        client_history,
    )
    history = merged_history if merged_history else None
    supports_section_stream = bool(
        (body.client_capabilities or {}).get("supports_section_stream"),
    )
    cacheable = (
        not client_history
        and not body.conversation_id
        and not resume_id
        and bool((body.ref or "").strip())
        and bool((body.question or "").strip())
    )
    request_verse_span = verse_span_from_ref(body.ref)
    key = (
        cache_key(
            ref=body.ref,
            mode=body.mode,
            question=body.question,
            scene=body.scene,
            knowledge_base_id=body.knowledge_base_id,
            verse_span=request_verse_span,
        )
        if cacheable
        else ""
    )
    cached = get_answer(key) if key else None
    if cached and not cache_suitable_for_request(
        cached,
        request_verse_span=request_verse_span,
    ):
        cached = None

    android_native = _is_android_native_client(
        x_client_kind=x_client_kind, surface=body.surface
    )
    unlimited = bool(logged_in) or android_native
    if cached:
        # 缓存命中不计额度
        used, limit = (0, 0) if unlimited else peek_quota(
            x_guest_id, settings.ai_guest_daily_limit
        )

        def gen_cached():
            cached_meta = cached.get("meta") or {}
            scene_id = cached_meta.get("scene") or body.scene or ""
            verse_span = int(cached_meta.get("verse_span") or 1)
            narrow = bool(cached_meta.get("narrow"))
            output_plan = build_output_plan(
                scene_id,
                narrow=narrow,
                verse_span=verse_span,
                surface=body.surface or "",
                wants_followups=bool(cached_meta.get("wants_followups")),
                question=body.question,
            )
            meta = {
                **cached_meta,
                "cache_hit": True,
                "cache_source": cached.get("source") or "cache",
                "instant": True,
                "quota": {"used": used, "limit": limit},
                "output_plan": output_plan,
                "conversation_id": conversation_id,
            }
            yield _sse("meta", meta)
            answer = cached.get("answer") or ""
            if not answer.strip():
                yield _sse(
                    "error",
                    {"message": "缓存为空，请重试", "retryable": True},
                )
                log_ai_request(
                    device_id=x_guest_id,
                    user_id=logged_in,
                    scene=(cached.get("meta") or {}).get("scene"),
                    mode=body.mode,
                    surface=body.surface,
                    status="error",
                )
                return
            # 分小块推送，保持前端流式路径；支持 section_* 的客户端走同一套增量协议
            plan_titles = (
                output_plan.get("sections")
                if isinstance(output_plan, dict)
                else None
            )
            if supports_section_stream:
                for ev, payload in iter_replay_stream(
                    answer,
                    plan_titles,
                    emit_delta=True,
                    emit_sections=True,
                ):
                    yield _sse(ev, payload)
            else:
                step = 48
                for i in range(0, len(answer), step):
                    yield _sse("delta", {"text": answer[i : i + step]})
            followups = cached.get("followups") or []
            if followups:
                yield _sse("followups", {"items": followups})
            document = document_from_cache_entry(
                answer,
                followups=followups,
                sections=cached.get("sections"),
                cached_document=cached.get("document"),
            )
            yield _sse(
                "done",
                build_done_sse_payload(
                    answer,
                    followups=followups,
                    document=document,
                    cache_hit=True,
                    cache_source=cached.get("source") or "cache",
                    instant=True,
                    conversation_id=conversation_id,
                ),
            )
            append_turns(
                conversation_id,
                user_content=body.question or "",
                assistant_content=answer,
            )
            log_ai_request(
                device_id=x_guest_id,
                user_id=logged_in,
                scene=(cached.get("meta") or {}).get("scene"),
                mode=body.mode,
                surface=body.surface,
                status="ok",
                cache_hit=True,
                latency_ms=0,
            )

        return StreamingResponse(
            gen_cached(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    if idempotency_key and not claim_idempotency(
        idempotency_key,
        guest_id=x_guest_id,
    ):
        return JSONResponse(
            status_code=409,
            content={
                "error": "重复请求，请稍候",
                "code": "duplicate_request",
            },
        )

    if unlimited:
        allowed, used, limit = True, 0, 0
        if logged_in:
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

    def gen():
        t_gen = time.monotonic()
        first_token_ms: int | None = None
        first_content_ms: int | None = None
        # 尽早推送 meta，避免 prepare/RAG 阻塞首包导致客户端超时
        yield _sse(
            "meta",
            {
                "scene": body.scene,
                "mode": body.mode,
                "citations_pending": True,
                "quota": {"used": used, "limit": limit},
            },
        )
        prep_result: dict = {}
        prep_err: list[Exception] = []

        def _run_prepare() -> None:
            try:
                prep_result["prep"] = prepare(
                    ref_raw=body.ref,
                    question=body.question,
                    mode=body.mode,
                    scene=body.scene,
                    history=history,
                    surface=body.surface,
                    reader_context=body.reader_context,
                    knowledge_base_id=body.knowledge_base_id,
                )
            except Exception as exc:
                prep_err.append(exc)

        try:
            thread = threading.Thread(target=_run_prepare, daemon=True)
            thread.start()
            while thread.is_alive():
                yield _sse_comment()
                thread.join(timeout=3.0)
            if prep_err:
                raise prep_err[0]
            prep = prep_result["prep"]
        except Exception as exc:
            logger.exception("ai chat prepare failed")
            log_ai_request(
                device_id=x_guest_id,
                user_id=logged_in,
                scene=body.scene,
                mode=body.mode,
                surface=body.surface,
                status="error",
            )
            yield _sse("error", {"message": f"小爱暂时无法回应：{exc}", "retryable": True})
            return

        prepare_ms = int((time.monotonic() - t_gen) * 1000)
        yield _sse(
            "meta",
            {
                **prep["meta"],
                "quota": {"used": used, "limit": limit},
                "conversation_id": conversation_id,
                "timings": {"prepare_ms": prepare_ms},
            },
        )
        full = []
        scene = prep["meta"].get("scene")
        messages = list(prep["messages"])
        max_tokens = int(prep["max_tokens"])
        verse_span = int(prep["meta"].get("verse_span") or 1)
        narrow = bool(prep["meta"].get("narrow"))
        _plan = prep["meta"].get("output_plan") or {}
        _dk = depth_kwargs_from_plan(_plan)
        _depth = prep["meta"].get("depth") or _dk.get("depth")
        section_tracker = (
            SectionStreamTracker(
                (prep["meta"].get("output_plan") or {}).get("sections"),
            )
            if supports_section_stream
            else None
        )
        if section_tracker:
            for start in section_tracker.bootstrap_starts():
                yield _sse("section_start", start)
        llm_t0 = time.monotonic()
        length_cont_used = False
        citation_cont_used = False
        budget_exhausted = False

        def _budget_left() -> float:
            return _LLM_WALL_BUDGET_SEC - (time.monotonic() - llm_t0)

        def _yield_replay_text(text: str) -> None:
            """空答/structured 恢复：走 section_* 协议，避免 section 模式丢 delta。"""
            plan_titles = (
                _plan.get("sections") if isinstance(_plan, dict) else None
            )
            for ev, payload in iter_replay_stream(
                text,
                plan_titles,
                emit_delta=True,
                emit_sections=bool(section_tracker),
            ):
                if ev == "delta":
                    full.append(payload.get("text") or "")
                yield _sse(ev, payload)

        def _mark_first_content(piece: str) -> None:
            nonlocal first_token_ms, first_content_ms
            if not piece:
                return
            now_ms = int((time.monotonic() - t_gen) * 1000)
            if first_token_ms is None:
                first_token_ms = now_ms
            if first_content_ms is None and piece.strip():
                first_content_ms = now_ms

        def _stream_budgeted(
            msgs: list[dict[str, str]],
            *,
            budget: int,
            meta: StreamMeta | None = None,
        ):
            nonlocal budget_exhausted
            if _budget_left() <= 0:
                budget_exhausted = True
                logger.warning(
                    "ai chat llm wall budget exhausted scene=%s span=%s",
                    scene,
                    verse_span,
                )
                return
            timeout_sec = min(120.0, max(5.0, _budget_left()))
            for piece in stream_chat(
                msgs,
                max_tokens=budget,
                meta=meta,
                timeout_sec=timeout_sec,
            ):
                _mark_first_content(piece)
                full.append(piece)
                yield _sse("delta", {"text": piece})
                if section_tracker:
                    starts, s_deltas, _corrections = section_tracker.on_delta(piece)
                    for start in starts:
                        yield _sse("section_start", start)
                    for sd in s_deltas:
                        yield _sse("section_delta", sd)
                    # 流中不发 section_done 修正：终稿 normalize 已 merge，
                    # 中途整节替换会导致 UI 反复刷新/重写。

        def _run_length_continuation(meta: StreamMeta, *, force: bool = False) -> None:
            nonlocal length_cont_used
            if length_cont_used or not full:
                return
            if not force and meta.finish_reason != "length":
                return
            if _budget_left() <= 0:
                return
            length_cont_used = True
            cont_budget = min(max(max_tokens // 3, 280), 600)
            if verse_span > 5:
                cont_budget = min(max_tokens // 3, 750)
            cont_msgs = messages + [
                {"role": "assistant", "content": "".join(full)},
                {
                    "role": "user",
                    "content": (
                        "请从中断处续写，只补完最后一个未写完的句子或最后一条列表要点；"
                        "不要新增 ### 小节标题，不要写「（续）」类标题，"
                        "不要重复已有要点，自然收束即可。"
                    ),
                },
            ]
            cont_meta = StreamMeta()
            yield from _stream_budgeted(cont_msgs, budget=cont_budget, meta=cont_meta)
            if cont_meta.finish_reason:
                meta.finish_reason = cont_meta.finish_reason

        def _run_citation_repair() -> None:
            nonlocal citation_cont_used
            if citation_cont_used or not full:
                return
            if _budget_left() <= 0:
                return
            from .post_process import needs_citation_repair

            body_probe, _ = split_body_and_followups("".join(full))
            meta_prep = prep.get("meta") or {}
            cite_list = meta_prep.get("citations") or []
            if not needs_citation_repair(
                body_probe,
                has_rag=bool(meta_prep.get("use_rag") and cite_list),
                citation_count=len(cite_list),
            ):
                return
            citation_cont_used = True
            cont_msgs = messages + [
                {"role": "assistant", "content": "".join(full)},
                {
                    "role": "user",
                    "content": (
                        "正文已使用注释观点但缺少脚注。请在现有正文句末适当位置"
                        "补充 [1][2] 脚注（序号须与注释列表一致），不要重写或明显拉长正文。"
                    ),
                },
            ]
            cont_meta = StreamMeta()
            yield from _stream_budgeted(cont_msgs, budget=220, meta=cont_meta)

        try:
            meta = StreamMeta()
            yield from _stream_budgeted(messages, budget=max_tokens, meta=meta)
            if not narrow and full:
                body_probe, _ = split_body_and_followups("".join(full))
                need_length = meta.finish_reason == "length" and answer_ends_abruptly(
                    body_probe,
                )
                if scene in ("verse_full", "verse_quick") and not need_length:
                    need_length = verse_needs_length_continuation(
                        scene,
                        body_probe,
                        verse_span=verse_span,
                        finish_reason=meta.finish_reason,
                        depth=_depth,
                        expected_sections=_dk.get("expected_sections"),
                        min_complete=_dk.get("min_complete"),
                    )
                if need_length:
                    yield from _run_length_continuation(
                        meta,
                        force=(
                            meta.finish_reason == "length"
                            or answer_ends_abruptly(body_probe)
                            or mid_bullet_truncated(body_probe)
                        ),
                    )
            yield from _run_citation_repair()
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
            yield _sse(
                "error",
                {
                    "message": f"小爱暂时无法回应：{exc}",
                    "retryable": not bool(full),
                    "delta_count": len(full),
                },
            )
            return
        if not full:
            retry_modes: list[tuple[bool, bool]] = []
            recover_variants: list[list[dict[str, str]]] = []
            if history:
                retry_modes.append((True, False))
            retry_modes.append((True, True))
            recover_variants.append(list(messages))
            if scene in ("verse_full", "verse_quick"):
                try:
                    structured = try_structured_verse_answer(
                        messages,
                        scene or "",
                        max_tokens=min(max_tokens, 900),
                        verse_span=verse_span,
                    )
                except Exception:
                    logger.exception("structured verse recover failed scene=%s", scene)
                    structured = None
                if structured and structured.strip():
                    yield from _yield_replay_text(structured.strip())
            for nudge, strip_history in retry_modes:
                if full:
                    break
                try:
                    if strip_history or not history:
                        retry_msgs = [dict(messages[0]), dict(messages[-1])]
                    else:
                        retry_msgs = list(messages)
                    if nudge and retry_msgs:
                        last = retry_msgs[-1]
                        retry_msgs[-1] = {
                            "role": last["role"],
                            "content": (
                                f"{last['content']}\n\n"
                                "请直接用 Markdown 输出成稿答案（含规定小节），"
                                "不要输出思考过程。"
                            ),
                        }
                    if strip_history or not history:
                        recover_variants.append(list(retry_msgs))
                    retry_meta = StreamMeta()
                    retry_budget = min(max_tokens, 900)
                    yield from _stream_budgeted(
                        retry_msgs,
                        budget=retry_budget,
                        meta=retry_meta,
                    )
                except Exception:
                    logger.exception("ai chat empty-response retry failed")
            if not full:
                try:
                    recovered = recover_empty_response(
                        messages,
                        scene or "",
                        max_tokens=max(max_tokens, 900),
                        verse_span=verse_span,
                        narrow=False,
                        message_variants=recover_variants or None,
                    )
                except Exception:
                    logger.exception("ai chat recover_empty_response failed")
                    recovered = None
                if recovered:
                    yield from _yield_replay_text(recovered.strip())
        if not full:
            log_ai_request(
                device_id=x_guest_id,
                user_id=logged_in,
                scene=scene,
                mode=body.mode,
                surface=body.surface,
                status="error",
            )
            yield _sse(
                "error",
                {
                    "message": "未收到模型回应，请稍后重试",
                    "retryable": True,
                },
            )
            return
        text = normalize_answer_markdown(
            merge_continuation_sections("".join(full)),
            scene or "",
            narrow=narrow,
            verse_span=verse_span,
            depth=_depth,
            soft_max=_dk.get("soft_max"),
            prefer_prose=bool(_dk.get("prefer_prose")),
        )
        body_probe, _ = split_body_and_followups(text)
        _body_incomplete = answer_marked_incomplete(
            scene or "",
            body_probe,
            verse_span=verse_span,
            depth=_depth,
            expected_sections=_dk.get("expected_sections"),
            min_complete=_dk.get("min_complete"),
        )
        _fill_depth = "standard" if _depth == "flash" else _depth
        _should_fill = _depth in ("deep", "study") or (
            scene in ("verse_full", "verse_quick") and _body_incomplete
        )
        _fill_attempted = False
        if _budget_left() > 3 and _should_fill:
            _fill_attempted = True
            filled = section_fill_once(
                messages,
                body_probe,
                scene or "",
                narrow=narrow,
                max_tokens=min(max_tokens // 2, 700),
                verse_span=verse_span,
                depth=_fill_depth,
                planned_sections=_dk.get("expected_sections"),
                min_complete=_dk.get("min_complete"),
            )
            if filled and filled.strip():
                text = normalize_answer_markdown(
                    filled,
                    scene or "",
                    narrow=narrow,
                    verse_span=verse_span,
                    depth=_depth,
                    soft_max=_dk.get("soft_max"),
                    prefer_prose=bool(_dk.get("prefer_prose")),
                    format_only=True,
                )
        body_text, followups = split_body_and_followups(text)
        if followups:
            yield _sse("followups", {"items": followups})
        incomplete = answer_marked_incomplete(
            scene or "",
            body_text,
            verse_span=verse_span,
            depth=_depth,
            expected_sections=_dk.get("expected_sections"),
            min_complete=_dk.get("min_complete"),
        )
        if incomplete and scene in ("verse_full", "verse_quick") and _budget_left() > 5:
            try:
                structured = try_structured_verse_answer(
                    messages,
                    scene or "",
                    max_tokens=min(max_tokens, 900),
                    verse_span=verse_span,
                )
            except Exception:
                logger.exception("structured recover on incomplete scene=%s", scene)
                structured = None
            if structured and structured.strip():
                text = normalize_answer_markdown(
                    merge_continuation_sections(structured.strip()),
                    scene or "",
                    narrow=narrow,
                    verse_span=verse_span,
                    depth=_depth,
                    soft_max=_dk.get("soft_max"),
                    prefer_prose=bool(_dk.get("prefer_prose")),
                )
                body_text, followups = split_body_and_followups(text)
                incomplete = answer_marked_incomplete(
                    scene or "",
                    body_text,
                    verse_span=verse_span,
                    depth=_depth,
                    expected_sections=_dk.get("expected_sections"),
                    min_complete=_dk.get("min_complete"),
                )
        if (
            incomplete
            and scene in ("verse_full", "verse_quick")
            and _budget_left() > 3
            and _fill_attempted
            and _fill_depth != "structure"
        ):
            filled = section_fill_once(
                messages,
                body_text,
                scene or "",
                narrow=narrow,
                max_tokens=min(max_tokens // 2, 700),
                verse_span=verse_span,
                depth="structure",
                planned_sections=_dk.get("expected_sections"),
                min_complete=_dk.get("min_complete"),
            )
            if filled and filled.strip():
                text = normalize_answer_markdown(
                    filled,
                    scene or "",
                    narrow=narrow,
                    verse_span=verse_span,
                    depth=_depth,
                    soft_max=_dk.get("soft_max"),
                    prefer_prose=bool(_dk.get("prefer_prose")),
                    format_only=True,
                )
                body_text, followups = split_body_and_followups(text)
                incomplete = answer_marked_incomplete(
                    scene or "",
                    body_text,
                    verse_span=verse_span,
                    depth=_depth,
                    expected_sections=_dk.get("expected_sections"),
                    min_complete=_dk.get("min_complete"),
                )
        if incomplete and scene in ("verse_full", "verse_quick") and _budget_left() > 6:
            logger.warning(
                "ai answer incomplete silent retry scene=%s span=%s depth=%s len=%s",
                scene,
                verse_span,
                _depth,
                len(body_text),
            )
            try:
                recovered = recover_incomplete_verse_answer(
                    messages,
                    scene or "",
                    max_tokens=max_tokens,
                    verse_span=verse_span,
                )
            except Exception:
                logger.exception("recover_incomplete_verse_answer failed scene=%s", scene)
                recovered = None
            if recovered and recovered.strip():
                text = normalize_answer_markdown(
                    merge_continuation_sections(recovered.strip()),
                    scene or "",
                    narrow=narrow,
                    verse_span=verse_span,
                    depth=_depth,
                    soft_max=_dk.get("soft_max"),
                    prefer_prose=bool(_dk.get("prefer_prose")),
                )
                body_text, followups = split_body_and_followups(text)
                incomplete = answer_marked_incomplete(
                    scene or "",
                    body_text,
                    verse_span=verse_span,
                    depth=_depth,
                    expected_sections=_dk.get("expected_sections"),
                    min_complete=_dk.get("min_complete"),
                )
        if incomplete:
            logger.warning(
                "ai answer incomplete final scene=%s span=%s depth=%s len=%s surface=%s",
                scene,
                verse_span,
                _depth,
                len(body_text),
                body.surface,
            )
            log_ai_request(
                device_id=x_guest_id,
                user_id=logged_in,
                scene=scene,
                mode=body.mode,
                surface=body.surface,
                status="error",
            )
            yield _sse(
                "error",
                {
                    "message": "回答未能完整生成，请重新生成",
                    "retryable": True,
                    "code": "incomplete_answer",
                },
            )
            return
        document = document_from_cache_entry(body_text, followups=followups)
        done_timings: dict[str, int] = {"prepare_ms": prepare_ms}
        if first_token_ms is not None:
            done_timings["first_token_ms"] = first_token_ms
        if first_content_ms is not None:
            done_timings["first_content_ms"] = first_content_ms
        if meta.reasoning_seen:
            logger.warning(
                "ai chat reasoning_content seen while thinking disabled scene=%s",
                scene,
            )
        ttft = first_content_ms or first_token_ms
        if ttft is not None and ttft > 5000:
            logger.warning(
                "ai chat slow first content ms=%s prepare_ms=%s scene=%s span=%s",
                ttft,
                prepare_ms,
                scene,
                verse_span,
            )
        if meta.prompt_cache_hit_tokens:
            done_timings["prompt_cache_hit_tokens"] = meta.prompt_cache_hit_tokens
        if meta.prompt_cache_miss_tokens:
            done_timings["prompt_cache_miss_tokens"] = meta.prompt_cache_miss_tokens
        yield _sse(
            "done",
            build_done_sse_payload(
                text,
                followups=followups,
                document=document,
                incomplete=incomplete,
                scene=scene or "",
                conversation_id=conversation_id,
                timings=done_timings,
            ),
        )
        append_turns(
            conversation_id,
            user_content=body.question or "",
            assistant_content=body_text,
        )
        if key and body_text and not body_text.startswith("⚠️") and not incomplete:
            put_answer(
                key,
                {
                    "answer": body_text,
                    "followups": followups,
                    "sections": document["sections"],
                    "document": document,
                    "meta": {**prep["meta"], "schema_version": SCHEMA_VERSION},
                    "source": "live",
                },
            )
        done_latency = done_timings.get("first_token_ms") or prepare_ms
        logger.info(
            "ai chat metrics scene=%s span=%s depth=%s chars=%s ttft_ms=%s incomplete=%s budget_exhausted=%s",
            scene,
            verse_span,
            _depth,
            len(body_text),
            done_timings.get("first_content_ms") or done_timings.get("first_token_ms"),
            incomplete,
            budget_exhausted,
        )
        log_ai_request(
            device_id=x_guest_id,
            user_id=logged_in,
            scene=scene,
            mode=body.mode,
            surface=body.surface,
            status="ok",
            latency_ms=int(done_latency) if done_latency else None,
        )

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
