"""DeepSeek（OpenAI 兼容）Chat Completions 流式客户端。

精简自 minimax `providers/openai_compat_text.py`：只保留流式正文产出，用 httpx。
"""
from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Iterator

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

_CLIENT_LOCK = threading.Lock()
_HTTP_CLIENT: httpx.Client | None = None


@dataclass
class StreamMeta:
    """流式结束后由 stream_chat 回填。"""

    finish_reason: str | None = None
    usage: dict[str, Any] = field(default_factory=dict)
    prompt_cache_hit_tokens: int = 0
    prompt_cache_miss_tokens: int = 0
    reasoning_seen: bool = False


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


def _reasoning_piece(delta: dict[str, Any]) -> str:
    val = delta.get("reasoning_content")
    return val if isinstance(val, str) else ""


def _thinking_disabled() -> bool:
    return bool(get_settings().deepseek_disable_thinking)


def _chat_payload(
    *,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
    stream: bool,
) -> dict[str, Any]:
    s = get_settings()
    payload: dict[str, Any] = {
        "model": s.deepseek_text_model,
        "messages": messages,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
        "stream": stream,
    }
    if _thinking_disabled():
        payload["thinking"] = {"type": "disabled"}
    return payload


def _get_http_client(*, timeout_sec: float = 120.0) -> httpx.Client:
    global _HTTP_CLIENT
    with _CLIENT_LOCK:
        if _HTTP_CLIENT is None or _HTTP_CLIENT.is_closed:
            _HTTP_CLIENT = httpx.Client(
                timeout=httpx.Timeout(timeout_sec, connect=10.0),
                limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
            )
        return _HTTP_CLIENT


def warm_connection() -> bool:
    """半屏打开时预热 TLS/连接（1 token ping，非答案缓存）。"""
    s = get_settings()
    if not s.deepseek_api_key:
        return False
    url = f"{s.deepseek_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {s.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    payload = _chat_payload(
        messages=[{"role": "user", "content": "ping"}],
        temperature=0.0,
        max_tokens=1,
        stream=False,
    )
    try:
        client = _get_http_client(timeout_sec=15.0)
        resp = client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return True
    except Exception:
        logger.debug("llm warm_connection failed", exc_info=True)
        return False


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
    payload = _chat_payload(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )
    client = _get_http_client(timeout_sec=timeout_sec)
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
                usage = data["usage"]
                meta.usage = usage
                meta.prompt_cache_hit_tokens = int(
                    usage.get("prompt_cache_hit_tokens") or 0,
                )
                meta.prompt_cache_miss_tokens = int(
                    usage.get("prompt_cache_miss_tokens") or 0,
                )
            choices = data.get("choices") or []
            if not choices or not isinstance(choices[0], dict):
                continue
            choice0 = choices[0]
            fr = choice0.get("finish_reason")
            if meta is not None and fr:
                meta.finish_reason = str(fr)
            delta = choice0.get("delta") or {}
            if meta is not None and isinstance(delta, dict) and _reasoning_piece(delta):
                meta.reasoning_seen = True
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
    payload = _chat_payload(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False,
    )
    client = _get_http_client(timeout_sec=timeout_sec)
    resp = client.post(url, json=payload, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    text = ""
    if isinstance(content, str):
        text = content
    elif content:
        text = _content_piece({"content": content})
    text = text.strip()
    if text:
        return text
    # thinking 误开或模型仅输出 reasoning 时，再 nudge 一次非流式成稿
    retry_msgs = [
        *messages,
        {
            "role": "user",
            "content": (
                "请直接输出完整 Markdown 成稿答案（含 ### 小节），"
                "不要输出思考过程，不要留空。"
            ),
        },
    ]
    resp = client.post(
        url,
        json={
            **_chat_payload(
                messages=retry_msgs,
                temperature=min(float(temperature) + 0.15, 0.7),
                max_tokens=max_tokens,
                stream=False,
            ),
        },
        headers=headers,
    )
    resp.raise_for_status()
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if isinstance(content, str):
        return content.strip()
    return _content_piece({"content": content}).strip() if content else ""
