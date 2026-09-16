#!/usr/bin/env python3
"""保罗第一次宣教 · glm-image vs CogView-4 对照样张。

同一套 prompt（复用 deepseek_spec_v311），只换图像模型。
字不进像素：只存 clean 图；中文在对比页 HTML。

用法：
  python scripts/gen_paul_model_ab.py
  python scripts/gen_paul_model_ab.py --only glm-image
  python scripts/gen_paul_model_ab.py --only cogview4
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from lib.visual_prompt_writer import (  # noqa: E402
    assemble_zhipu_prompt,
    load_dotenv as load_dotenv_shared,
    soften_for_1301,
)

SPEC_PATH = ROOT / "data/visual_cards/samples/paul_first_journey_v311/deepseek_spec_v314.json"
SPEC_FALLBACK = ROOT / "data/visual_cards/samples/paul_first_journey_v311/deepseek_spec_v311.json"
OUT_ROOT = ROOT / "data/visual_cards/samples/paul_first_journey_ab"
ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/images/generations"
ctx = ssl.create_default_context()

MODELS = {
    "glm-image": {
        "api_model": "glm-image",
        "size": "1728x960",
        "dir": "glm-image",
        "label": "GLM-Image",
    },
    "cogview4": {
        "api_model": "cogView-4-250304",
        "size": "1440x720",
        "dir": "cogview4",
        "label": "CogView-4",
    },
}


def env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"missing {name}")
    return v


def jobs_from_spec(spec: dict) -> list[dict]:
    """§19.14.6：默认只出 vignette；旧 spec 若仍有 overview 则跳过。"""
    out = []
    for i, d in enumerate(spec.get("details") or []):
        out.append(
            {
                "id": f"{i+1:02d}_{d.get('id') or f'd{i+1}'}",
                "label": d.get("label") or d.get("id") or "",
                "ref": d.get("ref") or "",
                "happen": d.get("happen") or "",
                "chips": d.get("beat_chips") or [],
                "prompt_en": d.get("prompt_en") or "",
                "negative": d.get("negative") or "",
                "risk_notes": d.get("risk_notes") or "",
            }
        )
    return out


def gen_image(
    api_model: str,
    size: str,
    prompt_en: str,
    raw_path: Path,
    *,
    negative: str = "",
    risk_notes: str = "",
) -> dict:
    key = env("ZHIPU_API_KEY")
    final = assemble_zhipu_prompt(prompt_en, negative)
    body = {
        "model": api_model,
        "prompt": final,
        "size": size,
        "watermark_enabled": False,
    }
    last: Exception | None = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                ZHIPU_URL,
                data=json.dumps(body).encode(),
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, context=ctx, timeout=240) as resp:
                payload = json.loads(resp.read().decode())
            url = payload["data"][0]["url"]
            urllib.request.urlretrieve(url, raw_path)
            return {"url": url, "prompt_final": final, "size": size, "model": api_model}
        except Exception as e:
            last = e
            print("retry", api_model, raw_path.name, attempt, e, flush=True)
            time.sleep(2 + attempt * 2)
            if "1301" in str(e) or "content" in str(e).lower():
                body["prompt"] = soften_for_1301(final, risk_notes)
    raise last  # type: ignore


def run_model(key: str, jobs: list[dict]) -> dict:
    cfg = MODELS[key]
    out_dir = OUT_ROOT / cfg["dir"]
    raw_dir = out_dir / "_raw"
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(exist_ok=True)

    results = []
    for j in jobs:
        raw = raw_dir / f"{j['id']}.png"
        clean = out_dir / f"{j['id']}.png"
        print(f"== {cfg['label']} {j['id']}", flush=True)
        meta = gen_image(
            cfg["api_model"],
            cfg["size"],
            j["prompt_en"],
            raw,
            negative=j.get("negative") or "",
            risk_notes=j.get("risk_notes") or "",
        )
        # clean = raw（字不进图）；复制一份到根目录便于对比页引用
        clean.write_bytes(raw.read_bytes())
        results.append(
            {
                **j,
                "file": clean.name,
                "raw": str(raw.relative_to(OUT_ROOT)),
                "url": meta["url"],
                "size": meta["size"],
                "model": meta["model"],
            }
        )
        time.sleep(0.6)

    index = {
        "id": f"paul_first_journey_ab_{key}",
        "title": "保罗第一次宣教",
        "model_key": key,
        "model_label": cfg["label"],
        "api_model": cfg["api_model"],
        "size": cfg["size"],
        "policy": "clean vignettes only; Chinese in comparison HTML",
        "jobs": results,
    }
    (out_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return index


def write_compare_html(glm: dict | None, cv4: dict | None, jobs: list[dict]) -> None:
    rows = []
    for j in jobs:
        fid = j["id"]
        left = f"glm-image/{fid}.png" if glm else ""
        right = f"cogview4/{fid}.png" if cv4 else ""
        chips = " · ".join(j.get("chips") or [])
        rows.append(
            f"""
<section class="row">
  <header>
    <h2>{j.get('label') or fid}</h2>
    <p class="meta">{j.get('ref') or ''} · {j.get('happen') or ''}</p>
    <p class="chips">{chips}</p>
  </header>
  <div class="pair">
    <figure>
      <figcaption>GLM-Image · 1728×960</figcaption>
      {"<img src='" + left + "' alt='glm'/>" if left else "<p class='miss'>未生成</p>"}
    </figure>
    <figure>
      <figcaption>CogView-4 · 1440×720</figcaption>
      {"<img src='" + right + "' alt='cv4'/>" if right else "<p class='miss'>未生成</p>"}
    </figure>
  </div>
</section>"""
        )

    html = f"""<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>保罗 · GLM-Image vs CogView-4</title>
<style>
  :root {{
    --bg: #f4efe6;
    --ink: #2c2825;
    --muted: #6e675f;
    --line: #ddd4c6;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    font-family: "PingFang SC", "Noto Sans SC", sans-serif;
    background:
      radial-gradient(1200px 600px at 20% -10%, #fff8ee 0%, transparent 55%),
      linear-gradient(180deg, #f7f3ec, var(--bg));
    color: var(--ink);
  }}
  main {{ max-width: 1100px; margin: 0 auto; padding: 28px 16px 72px; }}
  h1 {{ font-size: 1.45rem; margin: 0 0 6px; letter-spacing: 0.02em; }}
  .lead {{ color: var(--muted); line-height: 1.55; margin: 0 0 28px; max-width: 46rem; }}
  .row {{ margin: 0 0 36px; padding-top: 8px; border-top: 1px solid var(--line); }}
  .row h2 {{ font-size: 1.05rem; margin: 14px 0 4px; }}
  .meta, .chips {{ margin: 0; color: var(--muted); font-size: 0.9rem; }}
  .chips {{ margin-top: 2px; }}
  .pair {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 12px;
  }}
  figure {{ margin: 0; }}
  figcaption {{
    font-size: 0.78rem;
    color: var(--muted);
    margin-bottom: 6px;
    letter-spacing: 0.04em;
    text-transform: none;
  }}
  img {{
    width: 100%;
    display: block;
    border-radius: 2px;
    background: #ebe4d8;
  }}
  .miss {{ color: var(--muted); padding: 40px 0; text-align: center; }}
  @media (max-width: 720px) {{
    .pair {{ grid-template-columns: 1fr; }}
  }}
</style>
</head>
<body>
<main>
  <h1>保罗第一次宣教 · 模型对照</h1>
  <p class="lead">
    同一套 DeepSeek prompt（v311），分别用 <strong>glm-image</strong> 与
    <strong>cogView-4-250304</strong> 填格。画面为 clean vignette（无烤中文）；
    站名 / happen 仅在本页文案。释义说明，仅供参考。
  </p>
  {''.join(rows)}
</main>
</body>
</html>
"""
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUT_ROOT / "compare.html").write_text(html, encoding="utf-8")
    print("wrote", OUT_ROOT / "compare.html", flush=True)


def main() -> None:
    load_dotenv_shared(ROOT)
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["glm-image", "cogview4", "both"], default="both")
    args = ap.parse_args()

    path = SPEC_PATH if SPEC_PATH.exists() else SPEC_FALLBACK
    spec = json.loads(path.read_text(encoding="utf-8"))
    jobs = jobs_from_spec(spec)
    if not jobs or not jobs[0].get("prompt_en"):
        raise SystemExit(f"missing detail prompts in {path}")

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUT_ROOT / "shared_spec.json").write_text(
        json.dumps(
            {
                "source_spec": str(path.relative_to(ROOT)),
                "jobs": [
                    {
                        "id": j["id"],
                        "label": j["label"],
                        "ref": j["ref"],
                        "happen": j["happen"],
                        "chips": j["chips"],
                        "prompt_en": j["prompt_en"],
                        "negative": j.get("negative"),
                    }
                    for j in jobs
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    glm = cv4 = None
    if args.only in ("glm-image", "both"):
        glm = run_model("glm-image", jobs)
    if args.only in ("cogview4", "both"):
        cv4 = run_model("cogview4", jobs)

    # reload indexes if only one side ran
    if glm is None and (OUT_ROOT / "glm-image/index.json").exists():
        glm = json.loads((OUT_ROOT / "glm-image/index.json").read_text(encoding="utf-8"))
    if cv4 is None and (OUT_ROOT / "cogview4/index.json").exists():
        cv4 = json.loads((OUT_ROOT / "cogview4/index.json").read_text(encoding="utf-8"))

    write_compare_html(glm, cv4, jobs)
    print("ALL_OK", flush=True)


if __name__ == "__main__":
    main()
