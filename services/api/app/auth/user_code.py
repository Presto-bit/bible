"""10 位数字用户 ID ↔ 稳定 UUID（与 /auth/register 一致）。"""
from __future__ import annotations

import re
import uuid

CODE_RE = re.compile(r"^\d{10}$")
_CODE_NS = uuid.UUID("6f1a0c2e-9b3d-4e7a-8c1f-b1b1e0000001")


def pick_user_code(*candidates: str | None) -> str | None:
    for raw in candidates:
        code = (raw or "").strip()
        if CODE_RE.match(code):
            return code
    return None


def uuid_for_code(code: str) -> str:
    return str(uuid.uuid5(_CODE_NS, code.strip()))
