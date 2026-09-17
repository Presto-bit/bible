#!/usr/bin/env python3
"""行程手稿栅格：保罗同款「总图 → 分站」竖版（1080×1920）+ WebP。

旷野：
  - 总图：explainer 信息图（密）
  - 分站：站图 + 底栏 happen/link/经文/chips

加利利（暂无 AI 密图）：
  - 总图：行程弧线 + 七站目录
  - 分站：完整策展文案叶（happen/link/note/verse/chips）

依赖：magick、cwebp；中文字体 Songti。
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INFRA = ROOT / "apps/web/public/knowledge/infographics"
LAYOUTS = ROOT / "data/knowledge/layouts"
SAMPLES = ROOT / "data/visual_cards/samples"
PAPER = INFRA / "_paper_texture.jpg"
W = 1080
H = 1920
FONT = "/System/Library/Fonts/Supplemental/Songti.ttc"
IMG_H = 1120  # 分站上图高度，底栏留给文案


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def to_webp(png: Path, q: int = 78) -> None:
    webp = png.with_suffix(".webp")
    run(["cwebp", "-quiet", "-q", str(q), str(png), "-o", str(webp)])
    print("webp", webp.name, webp.stat().st_size)


def contain_on_paper(src: Path, dest: Path) -> None:
    """整图装入竖版（不裁切），纸感补边——适合「总图」信息图。"""
    with tempfile.TemporaryDirectory() as td:
        base = Path(td) / "base.png"
        paper_base(base)
        run(
            [
                "magick",
                str(base),
                "(",
                str(src),
                "-resize",
                f"{W}x{H}",
                ")",
                "-gravity",
                "center",
                "-compose",
                "over",
                "-composite",
                str(dest),
            ]
        )


def paper_base(path: Path) -> None:
    run(["magick", str(PAPER), "-resize", f"{W}x{H}!", str(path)])


def caption_block(path: Path, lines: list[tuple[str, str, int]], width: int) -> None:
    """生成左对齐文案块。lines: (color, text, pointsize)"""
    parts: list[str] = []
    for color, text, size in lines:
        text = (text or "").strip()
        if not text:
            continue
        parts.extend(
            [
                "(",
                "-background",
                "none",
                "-font",
                FONT,
                "-fill",
                color,
                "-pointsize",
                str(size),
                "-size",
                f"{width}x",
                f"caption:{text}",
                ")",
            ]
        )
    if not parts:
        run(["magick", "-size", f"{width}x40", "xc:none", str(path)])
        return
    run(["magick", *parts, "-gravity", "west", "-smush", "16", str(path)])


def station_page(src_img: Path | None, dest: Path, *, meta: dict) -> None:
    """上图（可无）+ 底栏策展文案。"""
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        base = td_path / "base.png"
        paper_base(base)

        order = int(meta.get("order") or 0)
        label = str(meta.get("label") or f"第 {order} 站")
        ref = str(meta.get("ref") or "").strip()
        happen = str(meta.get("happen") or "").strip()
        link = str(meta.get("link") or "").strip()
        note = str(meta.get("note") or "").strip()
        verse = str(meta.get("verse_excerpt") or "").strip()
        chips = meta.get("chips") or []
        chip_line = " · ".join(str(c) for c in chips if c)

        y_text = 96
        if src_img and src_img.exists():
            top = td_path / "top.png"
            run(
                [
                    "magick",
                    str(src_img),
                    "-resize",
                    f"{W}x{IMG_H}^",
                    "-gravity",
                    "center",
                    "-extent",
                    f"{W}x{IMG_H}",
                    str(top),
                ]
            )
            run(
                [
                    "magick",
                    str(base),
                    str(top),
                    "-gravity",
                    "north",
                    "-compose",
                    "over",
                    "-composite",
                    str(base),
                ]
            )
            y_text = IMG_H + 48

        head = f"第 {order} 站" + (f" · {ref}" if ref else "")
        lines: list[tuple[str, str, int]] = [
            ("#8a7a62", head, 24),
            ("#2c2416", label, 48),
            ("#3d3428", happen, 32),
            ("#5c4f3a", link, 28),
            ("#3d3428", note, 26),
            ("#5c4f3a", verse, 26),
            ("#8a7a62", chip_line, 24),
        ]
        # 有上图时底栏空间有限：优先 happen/link/verse/chips，note 可截
        if src_img and src_img.exists():
            lines = [
                ("#8a7a62", head, 24),
                ("#2c2416", label, 44),
                ("#3d3428", happen, 30),
                ("#5c4f3a", link, 26),
                ("#5c4f3a", verse, 24),
                ("#8a7a62", chip_line, 22),
            ]

        block = td_path / "block.png"
        caption_block(block, lines, W - 144)
        run(
            [
                "magick",
                str(base),
                str(block),
                "-geometry",
                f"+72+{y_text}",
                "-compose",
                "over",
                "-composite",
                str(dest),
            ]
        )


def overview_page(dest: Path, *, title: str, guide: str, beats: list[dict], arc: list[dict]) -> None:
    """总图页：导语 + 弧线 + 站序目录（加利利无密图时的总览）。"""
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        base = td_path / "base.png"
        paper_base(base)
        # 内框
        run(
            [
                "magick",
                str(base),
                "-fill",
                "rgba(44,36,22,0.05)",
                "-stroke",
                "rgba(92,79,58,0.25)",
                "-strokewidth",
                "2",
                "-draw",
                f"rectangle 48,64 {W - 48},{H - 64}",
                str(base),
            ]
        )

        arc_line = " → ".join(str(a.get("name") or "") for a in arc if a.get("name"))
        stops = []
        for b in beats:
            o = b.get("order")
            lab = b.get("label") or ""
            hap = b.get("happen") or ""
            stops.append(f"{o}. {lab}　{hap}")
        stop_text = "\n".join(stops)

        lines = [
            ("#8a7a62", "彼爱手稿 · 行程总览", 28),
            ("#2c2416", title, 52),
            ("#3d3428", guide, 32),
            ("#5c4f3a", f"行程弧线\n{arc_line}", 28),
            ("#2c2416", "各站", 30),
            ("#3d3428", stop_text, 30),
            ("#8a7a62", "左右滑动 · 进入各站分页", 26),
        ]
        block = td_path / "block.png"
        caption_block(block, lines, W - 160)
        run(
            [
                "magick",
                str(base),
                str(block),
                "-gravity",
                "center",
                "-compose",
                "over",
                "-composite",
                str(dest),
            ]
        )


def galilee_station_page(dest: Path, *, meta: dict) -> None:
    """加利利分站：居中手稿卡，铺满策展字段（暂无场景图）。"""
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        base = td_path / "base.png"
        paper_base(base)
        run(
            [
                "magick",
                str(base),
                "-fill",
                "rgba(44,36,22,0.05)",
                "-stroke",
                "rgba(92,79,58,0.22)",
                "-strokewidth",
                "2",
                "-draw",
                f"rectangle 48,64 {W - 48},{H - 64}",
                str(base),
            ]
        )

        order = int(meta.get("order") or 0)
        label = str(meta.get("label") or f"第 {order} 站")
        ref = str(meta.get("ref") or "").strip()
        happen = str(meta.get("happen") or "").strip()
        link = str(meta.get("link") or "").strip()
        note = str(meta.get("note") or "").strip()
        verse = str(meta.get("verse_excerpt") or "").strip()
        chips = meta.get("chips") or []
        chip_line = " · ".join(str(c) for c in chips if c)
        must = meta.get("must_see") or []
        must_line = "须看见：" + "、".join(str(m) for m in must if m) if must else ""

        head = f"第 {order} 站" + (f" · {ref}" if ref else "")
        lines: list[tuple[str, str, int]] = [
            ("#8a7a62", "彼爱手稿 · 分站", 26),
            ("#8a7a62", head, 26),
            ("#2c2416", label, 56),
            ("#3d3428", happen, 34),
            ("#5c4f3a", link, 30),
            ("#3d3428", note, 30),
            ("#5c4f3a", verse, 28),
            ("#8a7a62", must_line, 24),
            ("#8a7a62", chip_line, 24),
        ]
        block = td_path / "block.png"
        caption_block(block, lines, W - 160)
        run(
            [
                "magick",
                str(base),
                str(block),
                "-gravity",
                "center",
                "-compose",
                "over",
                "-composite",
                str(dest),
            ]
        )


def bake_wilderness() -> None:
    layout = json.loads((LAYOUTS / "exodus-wilderness.json").read_text(encoding="utf-8"))
    explainer = SAMPLES / "exodus_wilderness_explainer"
    v311 = SAMPLES / "exodus_wilderness_v311"

    # 总图：密信息图完整装入（不裁切），保留「总」信息密度
    comic_src = explainer / "exodus_wilderness_infographic.png"
    if not comic_src.exists():
        comic_src = v311 / "00_overview.png"
    comic = INFRA / "exodus-wilderness-comic.png"
    contain_on_paper(comic_src, comic)
    to_webp(comic)
    spine = INFRA / "exodus-wilderness.png"
    contain_on_paper(comic_src, spine)
    to_webp(spine)
    print("wrote", comic.name)

    # 分站图源：v311 站图；埃及无独立图用 overview
    station_src = {
        1: v311 / "00_overview.png",
        2: v311 / "01_red_sea.png",
        3: v311 / "02_marah.png",
        4: v311 / "03_elim.png",
        5: v311 / "05_rephidim.png",
        6: v311 / "06_sinai.png",
    }
    for b in layout.get("beats") or []:
        order = int(b.get("order") or 0)
        if order <= 0:
            continue
        dest = INFRA / f"exodus-wilderness-s{order:02d}.png"
        station_page(station_src.get(order), dest, meta=b)
        to_webp(dest)
        print("wrote", dest.name)


def bake_galilee() -> None:
    layout_path = LAYOUTS / "jesus-ministry-galilee.json"
    layout = json.loads(layout_path.read_text(encoding="utf-8"))
    title = layout.get("title") or "耶稣加利利事工"
    guide = layout.get("guide_one_liner") or ""
    beats = layout.get("beats") or []
    arc = layout.get("arc") or []

    comic = INFRA / "jesus-ministry-galilee-comic.png"
    overview_page(comic, title=title, guide=guide, beats=beats, arc=arc)
    to_webp(comic)
    print("wrote", comic.name)

    for b in beats:
        order = int(b.get("order") or 0)
        if order <= 0:
            continue
        dest = INFRA / f"jesus-ministry-galilee-s{order:02d}.png"
        galilee_station_page(dest, meta=b)
        to_webp(dest)
        print("wrote", dest.name)

    layout["cover_image"] = "/knowledge/infographics/jesus-ministry-galilee-comic.png"
    layout_path.write_text(
        json.dumps(layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("cover_image → comic")


def main() -> None:
    if not PAPER.exists():
        raise SystemExit(f"missing {PAPER}")
    bake_wilderness()
    bake_galilee()


if __name__ == "__main__":
    main()
