"""冲突解决（纯函数，便于单测）。

行级 LWW：以 client_ts 为准，较新者胜；同刻则 version 高者胜；仍相同则覆盖（幂等）。
（PRODUCT 设计为字段级 LWW，V1 先行级，后续可细化到字段。）
"""
from __future__ import annotations

from datetime import datetime


def should_apply(
    existing_ts: datetime | None,
    existing_version: int | None,
    incoming_ts: datetime | None,
    incoming_version: int | None,
) -> bool:
    if existing_ts is None:
        return True
    if incoming_ts is None:
        # 入向无时间戳：仅当版本更高才覆盖，否则保守拒绝
        return (incoming_version or 0) > (existing_version or 0)
    if incoming_ts > existing_ts:
        return True
    if incoming_ts < existing_ts:
        return False
    return (incoming_version or 0) >= (existing_version or 0)
