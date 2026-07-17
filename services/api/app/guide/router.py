"""资源指南接口。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .passage import guide_for_passage

router = APIRouter(prefix="/guide", tags=["guide"])


@router.get("/passage")
def passage(
    ref: str = Query(..., description="经文引用，如 JHN.3.16 / 约翰福音3:16"),
    top_k: int = Query(5, ge=1, le=20),
    knowledge_base_id: str | None = Query(
        None, description="知识库 id，缺省为平台库"
    ),
) -> dict:
    result = guide_for_passage(
        ref, top_k=top_k, knowledge_base_id=knowledge_base_id
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "解析失败"))
    return result
