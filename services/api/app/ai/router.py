"""POST /ai/chat — SSE 流式释经。"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from ..config import get_settings
from ..db import get_pool
from .chat import prepare
from .llm import stream_chat
from .usage import consume_quota

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
                "SELECT count(*) FROM bible_documents WHERE source_type='commentary'"
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


class Turn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    ref: str | None = None
    question: str | None = None
    mode: str = "understand"
    # 多轮上下文（客户端本地持有；local-first，不落服务端）
    history: list[Turn] | None = None
    # 契约对齐字段（当前仅透传/记录，不改变检索逻辑）
    scope: str | None = None
    surface: str | None = None
    conversation_id: str | None = None


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat")
def chat(
    body: ChatRequest,
    x_guest_id: str | None = Header(default=None),
):
    settings = get_settings()
    allowed, used, limit = consume_quota(x_guest_id, settings.ai_guest_daily_limit)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "error": "今日免费次数已用完，登录后可继续使用",
                "used": used,
                "limit": limit,
            },
        )

    history = [t.model_dump() for t in body.history] if body.history else None
    prep = prepare(ref_raw=body.ref, question=body.question, mode=body.mode, history=history)

    def gen():
        yield _sse("meta", {**prep["meta"], "quota": {"used": used, "limit": limit}})
        full = []
        try:
            for piece in stream_chat(prep["messages"]):
                full.append(piece)
                yield _sse("delta", {"text": piece})
        except Exception as exc:  # 上游/网络异常 → 友好错误事件
            logger.exception("ai chat stream failed")
            yield _sse("error", {"message": f"小爱暂时无法回应：{exc}"})
            return
        yield _sse("done", {"length": len("".join(full))})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
