"""MiniMax T2A 同步合成。"""
from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any

from ..config import get_settings

log = logging.getLogger(__name__)

T2A_URL = "https://api.minimaxi.com/v1/t2a_v2"


def synthesize_mp3(
    *,
    text: str,
    voice_id: str,
    model: str = "speech-2.8-turbo",
) -> tuple[bytes, int, int]:
    """返回 (mp3_bytes, duration_ms, usage_characters)。"""
    settings = get_settings()
    key = (settings.minimax_api_key or "").strip()
    if not key:
        raise RuntimeError("MINIMAX_API_KEY 未配置")

    clean = (text or "").strip()
    if not clean:
        raise RuntimeError("合成文本为空")

    payload: dict[str, Any] = {
        "model": model,
        "text": clean,
        "stream": False,
        "language_boost": "Chinese",
        "voice_setting": {
            "voice_id": voice_id,
            "speed": 1,
            "vol": 1,
            "pitch": 0,
            "emotion": "calm",
        },
        "audio_setting": {
            "format": "mp3",
            "sample_rate": 32000,
            "bitrate": 128000,
            "channel": 1,
        },
    }
    req = urllib.request.Request(
        T2A_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"MiniMax HTTP {e.code}: {detail}") from e

    base = body.get("base_resp") or {}
    # 注意：status_code=0 表示成功；不可写成 `x or -1`（0 会被当成假值）
    try:
        status_code = int(base.get("status_code", -1))
    except (TypeError, ValueError):
        status_code = -1
    if status_code != 0:
        msg = base.get("status_msg") or "unknown"
        raise RuntimeError(f"MiniMax 业务错误 {status_code}: {msg}")

    data = body.get("data") or {}
    audio_hex = data.get("audio") or ""
    if isinstance(audio_hex, str):
        audio_hex = audio_hex.strip()
    if not audio_hex:
        raise RuntimeError("MiniMax 未返回 audio")

    if audio_hex.startswith("http://") or audio_hex.startswith("https://"):
        try:
            with urllib.request.urlopen(audio_hex, timeout=120) as audio_resp:
                raw = audio_resp.read()
        except Exception as e:
            raise RuntimeError(f"下载 MiniMax 音频失败: {e}") from e
    else:
        hex_body = re.sub(r"[^0-9a-fA-F]", "", audio_hex)
        if len(hex_body) < 32 or len(hex_body) % 2:
            raise RuntimeError("MiniMax audio hex 无效")
        try:
            raw = bytes.fromhex(hex_body)
        except ValueError as e:
            raise RuntimeError(f"MiniMax audio hex 解析失败: {e}") from e

    if len(raw) < 64:
        raise RuntimeError("MiniMax 音频过短")

    extra = body.get("extra_info") or {}
    duration_ms = int(extra.get("audio_length") or 0)
    usage = int(extra.get("usage_characters") or 0)
    if duration_ms <= 0:
        # 粗估：128kbps mp3
        duration_ms = max(400, int(len(raw) * 8 / 128))
    return raw, duration_ms, usage
