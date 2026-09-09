"""POST /ai/chat 幂等键：短 TTL 内拒绝重复提交（防弱网双扣额度）。"""
from __future__ import annotations

import threading
import time

_TTL_SEC = 90.0
_lock = threading.Lock()
_claimed: dict[str, float] = {}


def claim_idempotency(key: str | None, *, guest_id: str | None) -> bool:
    """登记幂等键；False 表示 TTL 内已使用过。"""
    k = (key or "").strip()
    if not k:
        return True
    gid = (guest_id or "").strip() or "anon"
    composite = f"{gid}:{k}"
    now = time.monotonic()
    with _lock:
        expired = [ck for ck, ts in _claimed.items() if now - ts > _TTL_SEC]
        for ck in expired:
            _claimed.pop(ck, None)
        if composite in _claimed:
            return False
        _claimed[composite] = now
        if len(_claimed) > 2048:
            oldest = min(_claimed.items(), key=lambda x: x[1])[0]
            _claimed.pop(oldest, None)
    return True
