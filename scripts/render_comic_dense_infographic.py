#!/usr/bin/env python3
"""§19.14.16 密图 · 手绘复古纸稿（保罗首发）

气质：泛黄纸稿 + 墨线边框 + vignette 手绘母题。
中文由 HTML 排版；图大文精、去重、无遮挡印章。

用法：
  python3 scripts/render_comic_dense_infographic.py --id paul-first-journey
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
BEAT_MARK = {1: "差", 2: "海", 3: "堂", 4: "逼", 5: "治", 6: "徒", 7: "报"}


def short_ref(ref: str | None) -> str:
    if not ref:
        return ""
    parts = ref.replace(".", " ").split()
    if len(parts) >= 3:
        return f"{parts[1]}:{parts[2]}"
    if len(parts) == 2:
        return parts[1]
    return ref


def resolve_uri(v: str | None) -> str | None:
    if not v:
        return None
    p = PUBLIC / v.lstrip("/")
    return p.as_uri() if p.is_file() else None


def vignette_for(b: dict) -> str | None:
    order = b.get("order") or 0
    raw = (b.get("vignette") or "").strip() or VIGNETTE_FALLBACK.get(order) or OVERVIEW
    return resolve_uri(raw)


def find_chrome() -> str | None:
    for c in CHROME_CANDIDATES:
        if Path(c).is_file():
            return c
    return shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")


def ensure_paper_texture() -> str | None:
    out = PUBLIC / "knowledge/infographics/_paper_texture.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    old = PUBLIC / "knowledge/infographics/_paper_texture.png"
    if old.is_file():
        old.unlink()
    magick = shutil.which("magick")
    if not magick:
        return out.as_uri() if out.is_file() else None
    if not out.is_file() or out.stat().st_size > 400_000:
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


def doodle_corner(kind: str) -> str:
    if kind == "tl":
        return """<svg class="doodle tl" viewBox="0 0 80 80" aria-hidden="true">
          <path d="M8 55 C10 20 20 8 55 8" fill="none" stroke="#3b2f24" stroke-width="2.4"/>
          <path d="M14 48 C16 28 28 16 48 14" fill="none" stroke="#2f6f6a" stroke-width="1.6"/>
          <circle cx="22" cy="22" r="3" fill="#a65a3a"/>
        </svg>"""
    return """<svg class="doodle br" viewBox="0 0 80 80" aria-hidden="true">
      <path d="M72 25 C70 60 55 72 25 72" fill="none" stroke="#3b2f24" stroke-width="2.4"/>
      <path d="M66 32 C64 52 52 64 32 66" fill="none" stroke="#a65a3a" stroke-width="1.6"/>
      <path d="M40 48 l8 0 m-4 -4 l0 8" stroke="#2f6f6a" stroke-width="2"/>
    </svg>"""


def path_strip_svg(beats: list[dict]) -> str:
    n = max(len(beats), 1)
    width = 1000
    pad = 30
    usable = width - pad * 2
    cy = 28
    dots = []
    for i, b in enumerate(beats):
        x = pad + (usable * i / max(n - 1, 1) if n > 1 else usable / 2)
        order = b.get("order", i + 1)
        dots.append(
            f'<circle cx="{x:.1f}" cy="{cy}" r="13" fill="#efe2c6" stroke="#3b2f24" stroke-width="3"/>'
            f'<text x="{x:.1f}" y="{cy + 5}" text-anchor="middle" font-size="14" font-weight="800" fill="#3b2f24">{order}</text>'
        )
    line = ""
    if n > 1:
        pts = []
        for i in range(n):
            x = pad + usable * i / (n - 1)
            y = cy + (3 if i % 2 else -3)
            pts.append(f"{x:.1f},{y}")
        line = (
            f'<polyline points="{" ".join(pts)}" fill="none" stroke="#2f6f6a" '
            f'stroke-width="3.2" stroke-linecap="round"/>'
        )
    # 仅编号，站名留给卡片，避免与路径文案重复
    return f'<svg class="path-strip" viewBox="0 0 {width} 56" width="100%">{line}{"".join(dots)}</svg>'


def beat_card(b: dict, *, wide: bool = False) -> str:
    order = b.get("order", 0)
    label = b.get("label") or ""
    if order == 7 and "安提阿" in label:
        label = "回报安提阿"
    label = escape(label)
    happen = escape(b.get("happen") or "")
    sref = escape(short_ref(b.get("ref")))
    mark = BEAT_MARK.get(order, "·")
    vuri = vignette_for(b)
    img = f'<img class="art" src="{vuri}" alt="" />' if vuri else f'<div class="art empty">{mark}</div>'
    cls = "card wide" if wide else "card"
    return f"""
    <article class="{cls}">
      <div class="art-wrap">{img}
        <span class="badge">{order}</span>
        <span class="sref">{sref}</span>
        <span class="mark">{mark}</span>
      </div>
      <div class="txt">
        <h4>{label}</h4>
        <p class="hp">{happen}</p>
      </div>
    </article>
    """


def build_comic_html(layout: dict) -> str:
    title = layout.get("title") or "经文信息图"
    arcs = layout.get("arc") or []
    beats = layout.get("beats") or []
    by_order = {b.get("order"): b for b in beats}
    ref_span = "使徒行传 13–14"
    overview_uri = resolve_uri(OVERVIEW)
    paper_uri = ensure_paper_texture()
    paper_bg = f"url('{paper_uri}')" if paper_uri else "#efe2c6"

    panels: list[str] = []
    tones = ["tone-a", "tone-b", "tone-c"]
    for i, arc in enumerate(arcs):
        name = arc.get("name") or f"段落 {i + 1}"
        orders = arc.get("stop_orders") or []
        arc_beats = [by_order[o] for o in orders if o in by_order]
        cards = "".join(beat_card(b, wide=True) for b in arc_beats)
        grid = "grid-2" if len(arc_beats) >= 3 else "grid-1"
        panels.append(
            f"""
            <section class="panel {tones[i % 3]}">
              <header class="panel-head">
                <span class="panel-idx">0{i + 1}</span>
                <h3>{escape(name)}</h3>
              </header>
              <div class="cards {grid}">{cards}</div>
            </section>
            """
        )

    hero = ""
    if overview_uri:
        hero = f"""
        <div class="hero">
          <img src="{overview_uri}" alt="" />
          <div class="hero-cap"><strong>差遣 → 跨海 → 会堂 → 逼迫与医治 → 回报</strong></div>
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{
    width: {W}px; height: {H}px; overflow: hidden;
    font-family: "PingFang SC", "Hiragino Sans GB", "Songti SC", "Noto Serif SC", serif;
    color: #3b2f24;
  }}
  .page {{
    width: {W}px; height: {H}px;
    padding: 16px 18px 12px;
    display: flex; flex-direction: column; gap: 8px;
    background-color: #efe2c6;
    background-image: {paper_bg};
    background-size: cover;
    position: relative;
  }}
  .page::before {{
    content: "";
    pointer-events: none;
    position: absolute; inset: 10px;
    border: 2.5px solid rgba(59,47,36,.55);
    border-radius: 6px;
  }}
  .doodle {{ position: absolute; width: 60px; height: 60px; opacity: .7; z-index: 2; }}
  .doodle.tl {{ top: 10px; left: 10px; }}
  .doodle.br {{ bottom: 10px; right: 10px; }}
  .topbar {{
    display: flex; justify-content: flex-end; align-items: flex-start;
    min-height: 0; margin-bottom: -4px;
  }}
  .seal {{
    position: absolute;
    top: 22px;
    right: 22px;
    z-index: 5;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 3px solid #a65a3a;
    color: #a65a3a;
    background: rgba(255,248,232,.92);
    box-shadow:
      0 0 0 2px rgba(166,90,58,.22) inset,
      2px 2px 0 rgba(59,47,36,.08);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    transform: rotate(8deg);
    line-height: 1.15;
    pointer-events: none;
  }}
  .seal .seal-brand {{
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 0.12em;
  }}
  .seal .seal-sub {{
    margin-top: 2px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }}
  .seal::before {{
    content: "";
    position: absolute;
    inset: 5px;
    border-radius: 50%;
    border: 1.5px dashed rgba(166,90,58,.55);
  }}
  h1 {{ font-size: 40px; font-weight: 900; line-height: 1.08; padding-right: 92px; }}
  .head-row {{ display: block; }}
  .head-copy {{ min-width: 0; }}
  .refspan {{ margin-top: 6px; font-size: 22px; color: #a65a3a; font-weight: 800; }}
  .hero {{
    position: relative; height: 176px; border-radius: 10px; overflow: hidden;
    border: 2.8px solid #3b2f24; flex-shrink: 0;
  }}
  .hero img {{
    width: 100%; height: 100%; object-fit: cover; object-position: center 35%;
    filter: sepia(.2) contrast(1.03);
  }}
  .hero-cap {{
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 12px 14px;
    background: linear-gradient(transparent, rgba(35,26,18,.88));
    color: #fff8e8;
  }}
  .hero-cap strong {{ font-size: 22px; font-weight: 800; }}
  .path-wrap {{
    border: 2.2px solid #3b2f24;
    border-radius: 12px 3px 12px 3px;
    background: rgba(255,248,232,.85);
    padding: 4px 6px 2px; flex-shrink: 0;
  }}
  .panels {{
    flex: 1; min-height: 0;
    display: flex; flex-direction: column; gap: 7px;
  }}
  .panel {{
    min-height: 0;
    border: 2.5px solid #3b2f24;
    border-radius: 14px 5px 14px 5px;
    padding: 7px 8px 8px;
    display: flex; flex-direction: column; gap: 6px;
    background: rgba(255,248,232,.8);
  }}
  .tone-a {{ flex: 1.2; }}
  .tone-b {{ flex: 1.9; }}
  .tone-c {{ flex: 0.95; }}
  .panel-head {{ display: flex; align-items: baseline; gap: 8px; }}
  .panel-idx {{ font-size: 20px; font-weight: 900; color: #2f6f6a; }}
  .panel-head h3 {{ font-size: 22px; font-weight: 900; }}
  .cards {{ flex: 1; min-height: 0; display: grid; gap: 7px; }}
  .grid-1 {{ grid-template-columns: 1fr; }}
  .grid-2 {{ grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }}
  .card {{
    border: 2.2px solid #3b2f24;
    border-radius: 12px 4px 12px 4px;
    overflow: hidden; background: #fffaf0;
    display: flex; min-height: 0;
  }}
  .wide {{ flex-direction: row; align-items: stretch; }}
  .art-wrap {{ position: relative; background: #e5d5b8; }}
  .wide .art-wrap {{ width: 72%; flex: 0 0 72%; min-height: 100%; }}
  .grid-2 .wide .art-wrap {{ width: 70%; flex: 0 0 70%; }}
  .art {{
    width: 100%; height: 100%; object-fit: cover; display: block;
    filter: sepia(.16) contrast(1.02);
  }}
  .art.empty {{
    display: flex; align-items: center; justify-content: center;
    font-size: 34px; font-weight: 900; color: #a65a3a; height: 100%;
  }}
  .badge {{
    position: absolute; left: 7px; top: 7px;
    width: 28px; height: 28px; border-radius: 50%;
    background: #3b2f24; color: #efe2c6;
    font-size: 14px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #efe2c6;
  }}
  .sref {{
    position: absolute; left: 40px; top: 10px;
    background: rgba(255,248,232,.94);
    border: 1.5px solid #3b2f24; border-radius: 6px;
    padding: 1px 7px; font-size: 13px; font-weight: 900; color: #a65a3a;
  }}
  .mark {{
    position: absolute; right: 7px; top: 7px;
    width: 24px; height: 24px; border-radius: 6px;
    background: #2f6f6a; color: #fff8e8;
    font-size: 12px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
  }}
  .txt {{
    flex: 1; width: 0;
    padding: 8px 10px;
    display: flex; flex-direction: column; justify-content: center; gap: 4px;
  }}
  .txt h4 {{ font-size: 18px; font-weight: 900; line-height: 1.2; }}
  .hp {{ font-size: 14px; line-height: 1.32; font-weight: 700; }}
  .grid-2 .txt {{ padding: 7px 8px; }}
  .grid-2 .txt h4 {{ font-size: 15px; }}
  .grid-2 .hp {{ font-size: 12px; }}
  .grid-1 .wide .txt h4 {{ font-size: 20px; }}
  .grid-1 .wide .hp {{ font-size: 15px; }}
  .footer {{
    font-size: 13px; color: #6b5a48; font-weight: 700;
    display: flex; justify-content: space-between;
  }}
</style>
</head>
<body>
  <div class="page">
    {doodle_corner('tl')}
    <div class="seal" aria-label="彼爱手稿">
      <span class="seal-brand">彼爱</span>
      <span class="seal-sub">手稿</span>
    </div>
    <div class="head-row">
      <div class="head-copy">
        <h1>{escape(title)}</h1>
        <div class="refspan">{escape(ref_span)}</div>
      </div>
    </div>
    {hero}
    <div class="path-wrap">{path_strip_svg(beats)}</div>
    <div class="panels">{''.join(panels)}</div>
    <div class="footer">
      <span>释义说明，仅供参考</span>
      <span>安静读经，在话语中相遇</span>
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
    ap.add_argument("-o", "--out")
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
    out_dir = ROOT / "data/visual_cards/samples" / f"{layout_id}_comic_dense"
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / f"{layout_id}_comic_dense.html"
    png_path = Path(args.out) if args.out else out_dir / f"{layout_id}_comic_dense.png"
    if not png_path.is_absolute():
        png_path = ROOT / png_path

    html_path.write_text(build_comic_html(layout), encoding="utf-8")
    screenshot_html(chrome, html_path, png_path)
    magick = shutil.which("magick")
    if magick:
        subprocess.run([magick, str(png_path), "-resize", f"{W}x{H}!", str(png_path)], check=True)

    public_dir = PUBLIC / "knowledge/infographics"
    public_dir.mkdir(parents=True, exist_ok=True)
    public_png = public_dir / f"{layout_id}-comic.png"
    shutil.copy2(png_path, public_png)
    print(f"wrote {html_path}")
    print(f"wrote {png_path}")
    print(f"wrote {public_png}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
