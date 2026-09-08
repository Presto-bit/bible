"""DeepSeek（OpenAI 兼容）Chat Completions 流式客户端。

精简自 minimax `providers/openai_compat_text.py`：只保留流式正文产出，用 httpx。
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Iterator

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class StreamMeta:
    """流式结束后由 stream_chat 回填。"""

    finish_reason: str | None = None
    usage: dict[str, Any] = field(default_factory=dict)


def _content_piece(delta: dict[str, Any]) -> str:
    """从流式 delta 取正文（忽略 reasoning，问答场景不展示思考过程）。"""
    val = delta.get("content")
    if isinstance(val, str):
        return val
    if isinstance(val, list):
        parts = []
        for item in val:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
            elif isinstance(item, str):
                parts.append(item)
        return "".join(parts)
    return ""


def stream_chat(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.6,
    max_tokens: int = 900,
    timeout_sec: float = 120.0,
    meta: StreamMeta | None = None,
) -> Iterator[str]:
    """逐段产出 DeepSeek 正文 delta。异常向上抛出由路由处理。"""
    s = get_settings()
    if not s.deepseek_api_key:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY")
    url = f"{s.deepseek_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {s.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": s.deepseek_text_model,
        "messages": messages,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
        "stream": True,
    }
    with httpx.Client(timeout=httpx.Timeout(timeout_sec, connect=10.0)) as client:
        with client.stream("POST", url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if raw == "[DONE]":
                    break
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                err = data.get("error")
                if isinstance(err, dict) and err.get("message"):
                    raise RuntimeError(str(err["message"]))
                if meta is not None and isinstance(data.get("usage"), dict):
                    meta.usage = data["usage"]
                choices = data.get("choices") or []
                if not choices or not isinstance(choices[0], dict):
                    continue
                choice0 = choices[0]
                fr = choice0.get("finish_reason")
                if meta is not None and fr:
                    meta.finish_reason = str(fr)
                delta = choice0.get("delta") or {}
                piece = _content_piece(delta) if isinstance(delta, dict) else ""
                if piece:
                    yield piece


def complete_chat(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.3,
    max_tokens: int = 300,
    timeout_sec: float = 60.0,
) -> str:
    """非流式补全，返回完整正文。"""
    s = get_settings()
    if not s.deepseek_api_key:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY")
    url = f"{s.deepseek_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {s.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": s.deepseek_text_model,
        "messages": messages,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
        "stream": False,
    }
    with httpx.Client(timeout=httpx.Timeout(timeout_sec, connect=10.0)) as client:
        resp = client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if isinstance(content, str):
        return content
    return _content_piece({"content": content}) if content else ""
