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
