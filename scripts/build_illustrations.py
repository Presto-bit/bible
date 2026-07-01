#!/usr/bin/env python3
"""生成低饱和主题插画（SVG），用于「每日经文 hero」与「发现专题」卡片。

设计方案：
  - 低饱和（muted）调色：晨曦 / 雾蓝 / 沙 / 鼠尾草绿 / 黏土 / 石板，统一去饱和。
  - 极简几何 + 柔光：渐变天空 + 单一象征母题（光/山/水/路/麦/灯/橄榄枝/鸽/门）。
  - 16:9 宽幅，适配 hero 背景与卡片裁切；纯矢量，体积小、可着色。
输出：data/illustrations/theme_<主题>.svg + 一个总览 index.json。
"""
from __future__ import annotations

import json
import os

W, H = 800, 450

# 低饱和调色板（去饱和的柔和色）：sky_top, sky_bottom, motif, accent
PALETTES = {
    "dawn":  ("#e8ddd0", "#d9c9b6", "#b9a07e", "#cdb892"),   # 晨曦/沙
    "mist":  ("#dde4e6", "#c4d2d6", "#8aa3a8", "#a7bcc0"),   # 雾蓝
    "sage":  ("#dde2d6", "#c7d2c0", "#8a9c7c", "#a7b598"),   # 鼠尾草绿
    "clay":  ("#e6dcd4", "#d6c2b6", "#b08e7c", "#c6a895"),   # 黏土
    "slate": ("#dde0e6", "#c6cbd6", "#8b93a3", "#a8aebd"),   # 石板蓝灰
    "wheat": ("#e9e2cf", "#dcd0ac", "#c2ad74", "#d3c08c"),   # 麦
}

# 主题 -> (母题, 调色板)
THEME_MAP = {
    "盼望": ("sun", "dawn"),
    "平安": ("water", "mist"),
    "信靠": ("mountain", "slate"),
    "力量": ("mountain", "clay"),
    "爱": ("dove", "dawn"),
    "喜乐": ("sun", "wheat"),
    "智慧": ("lamp", "slate"),
    "引导": ("path", "sage"),
    "安慰": ("water", "mist"),
    "赦免": ("olive", "sage"),
    "感恩": ("wheat", "wheat"),
    "谦卑": ("path", "clay"),
    "勇气": ("mountain", "slate"),
    "应许": ("door", "dawn"),
    "祷告": ("lamp", "mist"),
    "敬拜": ("sun", "dawn"),
    "永生": ("door", "sage"),
    "顺服": ("path", "sage"),
    "忍耐": ("wheat", "wheat"),
    "恩典": ("olive", "dawn"),
}


def sky(p) -> str:
    return f'<rect x="0" y="0" width="{W}" height="{H}" fill="url(#sky)"/>'


def motif_sun(p) -> str:
    _, _, m, a = p
    return (
        f'<circle cx="{W*0.5:.0f}" cy="{H*0.46:.0f}" r="70" fill="{a}" opacity="0.55"/>'
        f'<circle cx="{W*0.5:.0f}" cy="{H*0.46:.0f}" r="44" fill="{m}" opacity="0.8"/>'
        + "".join(
            f'<rect x="{W*0.5-1.5:.0f}" y="{H*0.46-120:.0f}" width="3" height="44" rx="1.5" '
            f'fill="{m}" opacity="0.35" transform="rotate({deg} {W*0.5:.0f} {H*0.46:.0f})"/>'
            for deg in range(0, 360, 30)
        )
    )


def motif_mountain(p) -> str:
    _, _, m, a = p
    return (
        f'<path d="M0 {H} L{W*0.32:.0f} {H*0.42:.0f} L{W*0.55:.0f} {H} Z" fill="{m}" opacity="0.85"/>'
        f'<path d="M{W*0.42:.0f} {H} L{W*0.72:.0f} {H*0.34:.0f} L{W} {H} Z" fill="{a}" opacity="0.8"/>'
        f'<path d="M{W*0.66:.0f} {H*0.40:.0f} l18 14 -18 6 -16 -8 Z" fill="#f3efe9" opacity="0.7"/>'
    )


def motif_water(p) -> str:
    _, _, m, a = p
    waves = "".join(
        f'<path d="M0 {H*0.6+i*26:.0f} Q {W*0.25:.0f} {H*0.6+i*26-12:.0f} {W*0.5:.0f} {H*0.6+i*26:.0f} '
        f'T {W} {H*0.6+i*26:.0f}" stroke="{m if i%2 else a}" stroke-width="6" fill="none" '
        f'opacity="{0.5-i*0.06:.2f}"/>'
        for i in range(5)
    )
    return f'<circle cx="{W*0.5:.0f}" cy="{H*0.34:.0f}" r="34" fill="{a}" opacity="0.5"/>' + waves


def motif_path(p) -> str:
    _, _, m, a = p
    return (
        f'<rect x="0" y="{H*0.62:.0f}" width="{W}" height="{H*0.38:.0f}" fill="{a}" opacity="0.5"/>'
        f'<path d="M{W*0.5:.0f} {H} C {W*0.40:.0f} {H*0.82:.0f} {W*0.60:.0f} {H*0.74:.0f} {W*0.5:.0f} {H*0.6:.0f}" '
        f'stroke="{m}" stroke-width="46" fill="none" opacity="0.7" stroke-linecap="round"/>'
        f'<circle cx="{W*0.5:.0f}" cy="{H*0.5:.0f}" r="26" fill="{m}" opacity="0.45"/>'
    )


def motif_wheat(p) -> str:
    _, _, m, a = p
    stalks = "".join(
        f'<path d="M{x} {H} L{x} {H*0.45:.0f}" stroke="{m}" stroke-width="3" opacity="0.7"/>'
        f'<path d="M{x} {H*0.5:.0f} q 10 -6 16 -16 M{x} {H*0.5:.0f} q -10 -6 -16 -16" '
        f'stroke="{a}" stroke-width="3" fill="none" opacity="0.7"/>'
        for x in range(int(W*0.2), int(W*0.85), 46)
    )
    return f'<rect x="0" y="{H*0.7:.0f}" width="{W}" height="{H*0.3:.0f}" fill="{a}" opacity="0.35"/>' + stalks


def motif_lamp(p) -> str:
    _, _, m, a = p
    cx, cy = W*0.5, H*0.5
    return (
        f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="96" fill="{a}" opacity="0.35"/>'
        f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="58" fill="{a}" opacity="0.45"/>'
        f'<path d="M{cx-26:.0f} {cy+18:.0f} q26 26 52 0 q-6 -30 -26 -42 q-20 12 -26 42 Z" fill="{m}" opacity="0.85"/>'
        f'<path d="M{cx:.0f} {cy-30:.0f} q6 14 0 26 q-6 -12 0 -26 Z" fill="#f6f1e8" opacity="0.9"/>'
    )


def motif_olive(p) -> str:
    _, _, m, a = p
    cx, cy = W*0.5, H*0.5
    leaves = "".join(
        f'<ellipse cx="{cx+dx:.0f}" cy="{cy+dy:.0f}" rx="20" ry="8" fill="{m}" opacity="0.8" '
        f'transform="rotate({rot} {cx+dx:.0f} {cy+dy:.0f})"/>'
        for dx, dy, rot in [(-60,-6,20),(-30,-18,30),(0,-6,15),(30,-18,30),(60,-6,20),(-15,10,-20),(15,10,-15)]
    )
    return (
        f'<path d="M{cx-90:.0f} {cy:.0f} Q {cx:.0f} {cy-30:.0f} {cx+90:.0f} {cy:.0f}" '
        f'stroke="{a}" stroke-width="4" fill="none" opacity="0.7"/>' + leaves
    )


def motif_dove(p) -> str:
    _, _, m, a = p
    cx, cy = W*0.5, H*0.46
    return (
        f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="80" fill="{a}" opacity="0.3"/>'
        f'<path d="M{cx-40:.0f} {cy:.0f} q30 -34 70 -20 q-8 6 -10 16 q26 -6 40 6 '
        f'q-30 18 -64 12 q-18 -4 -36 -14 Z" fill="#f4efe7" opacity="0.92"/>'
        f'<path d="M{cx+30:.0f} {cy-4:.0f} q18 -10 34 -6 q-12 14 -30 12 Z" fill="{m}" opacity="0.6"/>'
    )


def motif_door(p) -> str:
    _, _, m, a = p
    cx = W*0.5
    return (
        f'<rect x="{cx-70:.0f}" y="{H*0.28:.0f}" width="140" height="{H*0.72:.0f}" rx="70" '
        f'fill="{a}" opacity="0.45"/>'
        f'<rect x="{cx-46:.0f}" y="{H*0.34:.0f}" width="92" height="{H*0.66:.0f}" rx="46" '
        f'fill="{m}" opacity="0.7"/>'
        f'<rect x="{cx-22:.0f}" y="{H*0.42:.0f}" width="44" height="{H*0.58:.0f}" rx="22" '
        f'fill="#f6f1e8" opacity="0.85"/>'
    )


MOTIFS = {
    "sun": motif_sun, "mountain": motif_mountain, "water": motif_water,
    "path": motif_path, "wheat": motif_wheat, "lamp": motif_lamp,
    "olive": motif_olive, "dove": motif_dove, "door": motif_door,
}


def build_svg(motif: str, palette_key: str) -> str:
    p = PALETTES[palette_key]
    top, bottom, _, _ = p
    grain = (
        f'<filter id="soft"><feGaussianBlur stdDeviation="0.6"/></filter>'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'width="{W}" height="{H}" role="img">'
        f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/>'
        f'</linearGradient>{grain}</defs>'
        f'<g filter="url(#soft)">{sky(p)}{MOTIFS[motif](p)}</g>'
        f'<rect x="0" y="0" width="{W}" height="{H}" fill="#ffffff" opacity="0.04"/>'
        f'</svg>'
    )


def main() -> None:
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(here, "data", "illustrations")
    os.makedirs(out_dir, exist_ok=True)

    index = []
    for theme, (motif, palette_key) in THEME_MAP.items():
        fname = f"theme_{theme}.svg"
        with open(os.path.join(out_dir, fname), "w", encoding="utf-8") as f:
            f.write(build_svg(motif, palette_key))
        index.append({"theme": theme, "motif": motif, "palette": palette_key, "file": fname})

    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as f:
        json.dump({
            "schema": "illustrations@1",
            "style": "低饱和 muted · 极简几何 + 柔光 · 16:9 矢量",
            "ratio": f"{W}:{H}",
            "palettes": list(PALETTES.keys()),
            "motifs": list(MOTIFS.keys()),
            "items": index,
        }, f, ensure_ascii=False, indent=2)

    print(f"illustrations: {len(index)} 张主题 SVG + index.json")


if __name__ == "__main__":
    main()
