"""8 位数字用户 ID ↔ 稳定 UUID；兼容历史 10 位 ID。"""

from __future__ import annotations

import re
import uuid

CODE_RE = re.compile(r"^\d{8}$")
LEGACY_CODE_RE = re.compile(r"^\d{10}$")
_CODE_NS = uuid.UUID("6f1a0c2e-9b3d-4e7a-8c1f-b1b1e0000001")


def is_user_code(raw: str | None) -> bool:
    code = (raw or "").strip()
    return bool(CODE_RE.match(code) or LEGACY_CODE_RE.match(code))


def pick_user_code(*candidates: str | None) -> str | None:
    for raw in candidates:
        code = (raw or "").strip()
        if is_user_code(code):
            return code
    return None


def uuid_for_code(code: str) -> str:
    return str(uuid.uuid5(_CODE_NS, code.strip()))
