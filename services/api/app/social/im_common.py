"""IM 消息统一序列化（E9）：群聊 / 私信共用字段。"""
from __future__ import annotations

from typing import Any


def im_message_dto(
    *,
    message_id: str,
    scope: str,
    ref_id: str,
    sender_id: str,
    kind: str,
    body: str,
    created_at: str,
    reply_to_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": message_id,
        "scope": scope,
        "ref_id": ref_id,
        "sender_id": sender_id,
        "kind": kind,
        "body": body,
        "created_at": created_at,
    }
    if reply_to_id:
        out["reply_to_id"] = reply_to_id
    if extra:
        out.update(extra)
    return out
