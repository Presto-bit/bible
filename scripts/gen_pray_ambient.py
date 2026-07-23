#!/usr/bin/env python3
"""Regenerate apps/web/public/audio/pray/*.mp3 ambient loops (requires ffmpeg)."""

from __future__ import annotations

import math
import struct
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps/web/public/audio/pray"
SR = 44100
DURATION = 24.0

TRACKS = [
    ("dawn", 130.81, [(1, 0.55), (2, 0.18), (3, 0.08)], 0.35),
    ("still", 146.83, [(1, 0.5), (1.5, 0.12), (2, 0.15)], 0.28),
    ("brook", 164.81, [(1, 0.45), (2, 0.2), (2.5, 0.1)], 0.4),
    ("vesper", 174.61, [(1, 0.52), (2, 0.14), (3, 0.1)], 0.3),
    ("olive", 196.00, [(1, 0.48), (1.5, 0.15), (2, 0.12)], 0.32),
    ("rest", 220.00, [(1, 0.5), (2, 0.16), (4, 0.05)], 0.25),
    ("cloud", 246.94, [(1, 0.42), (1.5, 0.18), (3, 0.08)], 0.38),
    ("deep", 110.00, [(1, 0.6), (2, 0.12), (0.5, 0.2)], 0.22),
    ("lamp", 261.63, [(1, 0.4), (2, 0.22), (3, 0.1)], 0.42),
    ("grace", 185.00, [(1, 0.5), (1.5, 0.14), (2.5, 0.1)], 0.33),
]


def soft_clip(x: float, soft: float = 0.85) -> float:
    return math.tanh(x / soft) * soft


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    n = int(SR * DURATION)
    for stem, root, partials, bright in TRACKS:
        wav_path = OUT / f"{stem}.wav"
        mp3_path = OUT / f"{stem}.mp3"
        frames = bytearray()
        for i in range(n):
            t = i / SR
            lfo = 0.92 + 0.08 * math.sin(2 * math.pi * t / DURATION)
            lfo2 = 0.97 + 0.03 * math.sin(4 * math.pi * t / DURATION + 1.2)
            sample = 0.0
            for mul, amp in partials:
                freq = root * mul
                det = 1.0 + 0.0015 * math.sin(2 * math.pi * t / DURATION + mul)
                sample += amp * math.sin(2 * math.pi * freq * det * t)
            sample += bright * 0.06 * math.sin(
                2 * math.pi * (root * 4.02) * t
                + 0.4 * math.sin(2 * math.pi * t / 6)
            )
            sample *= lfo * lfo2 * 0.22
            sample = soft_clip(sample)
            edge = min(i, n - 1 - i)
            if edge < 44:
                sample *= edge / 44
            frames += struct.pack("<h", max(-32767, min(32767, int(sample * 32767))))
        with wave.open(str(wav_path), "w") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(frames)
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(wav_path),
                "-codec:a",
                "libmp3lame",
                "-q:a",
                "6",
                "-ac",
                "1",
                str(mp3_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wav_path.unlink()
        print(stem, mp3_path.stat().st_size)


if __name__ == "__main__":
    main()
