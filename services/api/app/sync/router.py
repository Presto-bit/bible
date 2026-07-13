"""云同步接口：/sync/push · /sync/pull。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel

from ..auth.session import get_current_user
from . import engine
from .registry import all_entities

router = APIRouter(prefix="/sync", tags=["sync"])


class Change(BaseModel):
    entity: str
    op: str = "update"            # create|update|delete
    id: str | None = None
    keys: dict | None = None
    data: dict | None = None
    version: int | None = None
    client_ts: str | None = None


class PushBody(BaseModel):
    changes: list[Change]


@router.post("/push")
def push(
    body: PushBody,
    user_id: str = Depends(get_current_user),
    x_device_id: str | None = Header(default=None),
) -> dict:
    changes = [c.model_dump() for c in body.changes]
    return engine.push(user_id, changes, x_device_id)


@router.get("/pull")
def pull(
    since: int = Query(0, ge=0),
    entities: str | None = Query(None, description="逗号分隔实体名；省略=全部"),
    limit: int = Query(engine.PULL_DEFAULT_LIMIT, ge=1, le=2000),
    user_id: str = Depends(get_current_user),
) -> dict:
    ent_list = [e.strip() for e in entities.split(",") if e.strip()] if entities else None
    return engine.pull(user_id, since, ent_list, limit)


@router.get("/reading-state")
def reading_state(user_id: str = Depends(get_current_user)) -> dict:
    """按当前用户 ID 返回读经全量快照（打卡 / 进度 / 章节事件），供 PWA 重装恢复。"""
    return engine.reading_state(user_id)


@router.get("/entities")
def entities() -> dict:
    return {"entities": all_entities()}
