#!/usr/bin/env python3
"""§19.14.17 站手稿 · 每站一张 1080×1920（总图见 render_comic_dense_infographic）

用法：
  python3 scripts/render_station_dense_infographic.py --id paul-first-journey
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
W, H = 1080, 1920
PUBLIC = ROOT / "apps/web/public"

REF_BOOK = {
    "ACT": "使徒行传",
    "EXO": "出埃及记",
    "MAT": "马太福音",
    "MRK": "马可福音",
    "LUK": "路加福音",
    "JHN": "约翰福音",
}

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]

VIGNETTE_FALLBACK = {
    4: "/knowledge/vignettes/paul/05_iconium.png",
    6: "/knowledge/vignettes/paul/06_derbe.png",
}
OVERVIEW = "/knowledge/vignettes/paul/00_overview.png"


def find_chrome() -> str | None:
    for c in CHROME_CANDIDATES:
        if Path(c).is_file():
            return c
    return shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")


def ensure_paper_texture() -> str | None:
    out = PUBLIC / "knowledge/infographics/_paper_texture.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    magick = shutil.which("magick")
    if magick and (not out.is_file() or out.stat().st_size > 400_000):
        subprocess.run(
            [
                magick,
                "-size",
                "360x640",
                "xc:#efe2c6",
                "-seed",
                "14",
                "+noise",
                "Poisson",
                "-colorspace",
                "Gray",
                "-fill",
                "#efe2c6",
                "-colorize",
                "90",
                "-quality",
                "42",
                "-strip",
                str(out),
            ],
            check=False,
            capture_output=True,
        )
    return out.as_uri() if out.is_file() else None


def resolve_uri(v: str | None) -> str | None:
    if not v:
        return None
    p = PUBLIC / v.lstrip("/")
    return p.as_uri() if p.is_file() else None


def vignette_for(b: dict) -> str | None:
    order = b.get("order") or 0
    raw = (b.get("vignette") or "").strip() or VIGNETTE_FALLBACK.get(order) or OVERVIEW
    return resolve_uri(raw)


def format_ref(ref: str | None) -> str:
    if not ref:
        return ""
    parts = ref.replace(".", " ").split()
    if not parts:
        return ref
    book = REF_BOOK.get(parts[0], parts[0])
    if len(parts) >= 3:
        return f"{book} {parts[1]}:{parts[2]}"
    if len(parts) == 2:
        return f"{book} {parts[1]}"
    return book


def path_strip_svg(beats: list[dict], active: int) -> str:
    n = max(len(beats), 1)
    width = 1000
    pad = 36
    usable = width - pad * 2
    cy = 26
    dots = []
    for i, b in enumerate(beats):
        x = pad + (usable * i / max(n - 1, 1) if n > 1 else usable / 2)
        order = int(b.get("order") or i + 1)
        on = order == active
        fill = "#a65a3a" if on else "#efe2c6"
        stroke = "#a65a3a" if on else "#3b2f24"
        tc = "#fff8e8" if on else "#3b2f24"
        r = 15 if on else 12
        dots.append(
            f'<circle cx="{x:.1f}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="3"/>'
            f'<text x="{x:.1f}" y="{cy + 5}" text-anchor="middle" font-size="13" font-weight="800" fill="{tc}">{order}</text>'
        )
    line = ""
    if n > 1:
        x0 = pad
        x1 = pad + usable
        line = f'<path d="M{x0} {cy} Q{(x0+x1)/2} {cy-10} {x1} {cy}" fill="none" stroke="#3b2f24" stroke-width="2.4" stroke-dasharray="6 5"/>'
    return f'<svg viewBox="0 0 {width} 52" width="100%" height="52" aria-hidden="true">{line}{"".join(dots)}</svg>'


def build_station_html(layout: dict, beat: dict, beats: list[dict]) -> str:
    title = layout.get("title") or "彼爱手稿"
    total = len(beats)
    order = int(beat.get("order") or 1)
    label = beat.get("label") or f"第{order}站"
    happen = (beat.get("happen") or "").strip()
    link = (beat.get("link") or "").strip()
    note = (beat.get("note") or "").strip()
    excerpt = (beat.get("verse_excerpt") or "").strip()
    ref_label = format_ref(beat.get("ref"))
    vignette = vignette_for(beat)
    paper = ensure_paper_texture()
    paper_bg = f'url("{paper}")' if paper else "none"
    img = (
        f'<img src="{vignette}" alt="" />'
        if vignette
        else '<div class="art-fallback"></div>'
    )

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<style>
  @font-face {{
    font-family: "Noto Sans SC";
    src: local("PingFang SC"), local("Noto Sans SC"), local("Heiti SC"), local("Microsoft YaHei");
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    width: {W}px; height: {H}px; overflow: hidden;
    font-family: "Noto Sans SC", "PingFang SC", sans-serif;
    color: #2c2825;
    background-color: #efe2c6;
    background-image: {paper_bg};
    background-size: cover;
  }}
  .page {{
    width: {W}px; height: {H}px;
    padding: 36px 40px 32px;
    display: flex; flex-direction: column; gap: 14px;
    position: relative;
  }}
  .page::before {{
    content: "";
    pointer-events: none;
    position: absolute; inset: 12px;
    border: 2.5px solid rgba(59,47,36,.55);
    border-radius: 6px;
  }}
  .seal {{
    position: absolute; top: 24px; right: 24px; z-index: 5;
    width: 72px; height: 72px; border-radius: 50%;
    border: 3px solid #a65a3a; color: #a65a3a;
    background: rgba(255,248,232,.92);
    box-shadow: 0 0 0 2px rgba(166,90,58,.22) inset;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; transform: rotate(8deg); line-height: 1.15;
  }}
  .seal::before {{
    content: ""; position: absolute; inset: 5px; border-radius: 50%;
    border: 1.5px dashed rgba(166,90,58,.55);
  }}
  .seal .seal-brand {{ font-size: 15px; font-weight: 900; letter-spacing: 0.12em; }}
  .seal .seal-sub {{ margin-top: 2px; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; }}
  .eyebrow {{
    font-size: 18px; font-weight: 800; color: #a65a3a;
    letter-spacing: 0.06em; padding-right: 88px;
  }}
  h1 {{
    font-size: 42px; font-weight: 900; line-height: 1.15;
    padding-right: 88px; margin-top: 2px;
  }}
  .refspan {{ margin-top: 6px; font-size: 22px; color: #785035; font-weight: 800; }}
  .path {{ margin-top: 4px; }}
  .art {{
    flex: 0 0 auto; height: 760px; border-radius: 12px; overflow: hidden;
    border: 2.8px solid #3b2f24; margin-top: 4px;
  }}
  .art img {{
    width: 100%; height: 100%; object-fit: cover; object-position: center 35%;
    filter: sepia(.18) contrast(1.03);
  }}
  .art-fallback {{ width: 100%; height: 100%; background: #d9c9a8; }}
  .blocks {{
    flex: 1; display: flex; flex-direction: column; gap: 14px;
    min-height: 0; padding-top: 4px;
  }}
  .block {{
    border: 2px solid rgba(59,47,36,.45);
    border-radius: 12px;
    background: rgba(255,248,232,.72);
    padding: 14px 16px 12px;
  }}
  .block .k {{
    font-size: 14px; font-weight: 900; color: #a65a3a;
    letter-spacing: 0.08em; margin-bottom: 6px;
  }}
  .block .v {{
    font-size: 26px; font-weight: 800; line-height: 1.35;
  }}
  .block.note .v {{ font-size: 24px; font-weight: 700; line-height: 1.42; }}
  .block.verse {{
    border-style: dashed;
    background: rgba(255,248,232,.55);
  }}
  .block.verse .v {{ font-size: 22px; font-weight: 700; color: #4a3f34; }}
  .footer {{
    font-size: 14px; color: #6b5a48; font-weight: 700;
    display: flex; justify-content: space-between; margin-top: auto;
  }}
</style>
</head>
<body>
  <div class="page">
    <div class="seal" aria-label="彼爱手稿">
      <span class="seal-brand">彼爱</span>
      <span class="seal-sub">手稿</span>
    </div>
    <div class="eyebrow">{order} / {total} · 站手稿</div>
    <h1>{escape(label)}</h1>
    <div class="refspan">{escape(ref_label)}</div>
    <div class="path">{path_strip_svg(beats, order)}</div>
    <div class="art">{img}</div>
    <div class="blocks">
      <div class="block">
        <div class="k">发生</div>
        <div class="v">{escape(happen)}</div>
      </div>
      <div class="block">
        <div class="k">脉络</div>
        <div class="v">{escape(link)}</div>
      </div>
      <div class="block note">
        <div class="k">多懂一点</div>
        <div class="v">{escape(note)}</div>
      </div>
      {f'<div class="block verse"><div class="k">经文</div><div class="v">{escape(excerpt)}</div></div>' if excerpt else ''}
    </div>
    <div class="footer">
      <span>释义说明，仅供参考</span>
      <span>{escape(title)}</span>
    </div>
  </div>
</body>
</html>
"""


def screenshot_html(chrome: str, html_path: Path, png_path: Path) -> None:
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--window-size={W},{H}",
        f"--screenshot={png_path}",
        html_path.as_uri(),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", default="paul-first-journey")
    args = ap.parse_args()

    src = ROOT / "data/knowledge/layouts" / f"{args.id}.json"
    if not src.is_file():
        print(f"missing {src}", file=sys.stderr)
        return 1
    chrome = find_chrome()
    if not chrome:
        print("Chrome required", file=sys.stderr)
        return 1

    layout = json.loads(src.read_text(encoding="utf-8"))
    layout_id = layout.get("id") or args.id
    beats = layout.get("beats") or []
    if not beats:
        print("no beats", file=sys.stderr)
        return 1

    out_dir = ROOT / "data/visual_cards/samples" / f"{layout_id}_station_dense"
    out_dir.mkdir(parents=True, exist_ok=True)
    public_dir = PUBLIC / "knowledge/infographics"
    public_dir.mkdir(parents=True, exist_ok=True)
    magick = shutil.which("magick")

    for beat in beats:
        order = int(beat.get("order") or 0)
        stem = f"{layout_id}-s{order:02d}"
        html_path = out_dir / f"{stem}.html"
        png_path = out_dir / f"{stem}.png"
        html_path.write_text(build_station_html(layout, beat, beats), encoding="utf-8")
        screenshot_html(chrome, html_path, png_path)
        if magick:
            subprocess.run(
                [magick, str(png_path), "-resize", f"{W}x{H}!", str(png_path)],
                check=True,
            )
        public_png = public_dir / f"{stem}.png"
        shutil.copy2(png_path, public_png)
        print(f"wrote {public_png}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
