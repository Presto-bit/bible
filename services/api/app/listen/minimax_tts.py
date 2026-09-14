"""MiniMax T2A 同步合成（含可选字幕时间轴）。"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
import urllib.error
import urllib.request
from typing import Any

from ..config import get_settings

log = logging.getLogger(__name__)

T2A_URL = "https://api.minimaxi.com/v1/t2a_v2"

# T2A 官方约 60 RPM；全局串行节流，避免多章/多 job 互抢
_MIN_INTERVAL_SEC = 1.15
_rate_lock = threading.Lock()
_next_ok_at = 0.0


def _wait_rate_slot() -> None:
    global _next_ok_at
    with _rate_lock:
        now = time.monotonic()
        delay = _next_ok_at - now
        if delay > 0:
            time.sleep(delay)
        _next_ok_at = time.monotonic() + _MIN_INTERVAL_SEC


def _parse_status(body: dict[str, Any]) -> tuple[int, str]:
    base = body.get("base_resp") or {}
    try:
        code = int(base.get("status_code", -1))
    except (TypeError, ValueError):
        code = -1
    msg = str(base.get("status_msg") or "")
    return code, msg


def _decode_audio(data: dict[str, Any]) -> bytes:
    audio_hex = data.get("audio") or ""
    if isinstance(audio_hex, str):
        audio_hex = audio_hex.strip()
    if not audio_hex:
        raise RuntimeError("MiniMax 未返回 audio")

    if audio_hex.startswith("http://") or audio_hex.startswith("https://"):
        with urllib.request.urlopen(audio_hex, timeout=120) as audio_resp:
            raw = audio_resp.read()
    else:
        hex_body = re.sub(r"[^0-9a-fA-F]", "", audio_hex)
        if len(hex_body) < 32 or len(hex_body) % 2:
            raise RuntimeError("MiniMax audio hex 无效")
        raw = bytes.fromhex(hex_body)
    if len(raw) < 64:
        raise RuntimeError("MiniMax 音频过短")
    return raw


def _fetch_subtitles(url: str | None) -> list[dict[str, Any]]:
    if not url:
        return []
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception as e:
        log.warning("subtitle_file 拉取失败: %s", e)
        return []


def synthesize_mp3(
    *,
    text: str,
    voice_id: str,
    model: str = "speech-2.8-turbo",
    with_subtitles: bool = False,
    language_boost: str = "Chinese",
) -> tuple[bytes, int, int, list[dict[str, Any]]]:
    """返回 (mp3_bytes, duration_ms, usage_characters, subtitles)。"""
    settings = get_settings()
    key = (settings.minimax_api_key or "").strip()
    if not key:
        raise RuntimeError("MINIMAX_API_KEY 未配置")

    clean = (text or "").strip()
    if not clean:
        raise RuntimeError("合成文本为空")

    boost = (language_boost or "Chinese").strip() or "Chinese"
    payload: dict[str, Any] = {
        "model": model,
        "text": clean,
        "stream": False,
        "language_boost": boost,
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
    if with_subtitles:
        payload["subtitle_enable"] = True
        payload["subtitle_type"] = "sentence"

    last_err: Exception | None = None
    for attempt in range(6):
        _wait_rate_slot()
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
            with urllib.request.urlopen(req, timeout=180) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:400]
            last_err = RuntimeError(f"MiniMax HTTP {e.code}: {detail}")
            if e.code in (429, 503) and attempt < 5:
                time.sleep(2.0 * (attempt + 1))
                continue
            raise last_err from e

        code, msg = _parse_status(body)
        if code != 0:
            last_err = RuntimeError(f"MiniMax 业务错误 {code}: {msg}")
            # 1002 RPM / 1039 TPM
            if code in (1002, 1039) and attempt < 5:
                time.sleep(2.0 * (attempt + 1))
                continue
            raise last_err

        data = body.get("data") or {}
        raw = _decode_audio(data if isinstance(data, dict) else {})
        extra = body.get("extra_info") or {}
        duration_ms = int(extra.get("audio_length") or 0)
        usage = int(extra.get("usage_characters") or 0)
        if duration_ms <= 0:
            duration_ms = max(400, int(len(raw) * 8 / 128))
        subs = _fetch_subtitles(data.get("subtitle_file") if isinstance(data, dict) else None)
        return raw, duration_ms, usage, subs

    raise last_err or RuntimeError("MiniMax 合成失败")
