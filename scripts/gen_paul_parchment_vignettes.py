#!/usr/bin/env python3
"""保罗宣教 · §19.14.16 手绘复古纸稿 vignette 填格

DeepSeek 写词 → CogView-3-Flash 出干净母题 → 写入 public/knowledge/vignettes/paul/
再可重渲 comic 密图。

用法：
  python3 scripts/gen_paul_parchment_vignettes.py
  python3 scripts/gen_paul_parchment_vignettes.py --spec-only
  python3 scripts/gen_paul_parchment_vignettes.py --from-spec data/visual_cards/samples/paul_parchment/deepseek_spec.json
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lib.visual_prompt_writer import (  # noqa: E402
    DEFAULT_NEGATIVE,
    deepseek_write,
    load_dotenv,
    norm_text,
    soften_for_1301,
    validate_writer_spec,
)

OUT = ROOT / "data/visual_cards/samples/paul_parchment"
PUBLIC_PAUL = ROOT / "apps/web/public/knowledge/vignettes/paul"
IMG_MODEL = "cogview-3-flash"
SIZE = "1440x720"
ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/images/generations"

# 覆盖默认「扁平教育插画」→ 手绘羊皮纸稿
PARCHMENT_STYLE_SUFFIX = (
    " Style lock: hand-drawn ink linework with soft watercolor wash on aged parchment manuscript paper; "
    "vintage educational cartoon illustration; gentle original animated-character figures "
    "(simple round heads, robes, seen from behind or far distance — original design only, "
    "NOT any copyrighted anime or meme character); Mediterranean teal and terracotta ink accents; "
    "sketchy warm paper texture; charming but reverent; dense readable motifs; "
    "not photorealistic, not cinematic poster, not 3D CGI, not modern UI. "
    "Absolutely no text, letters, numbers, captions, watermarks, title bars, or map labels in the image pixels."
)

PARCHMENT_NEGATIVE = (
    DEFAULT_NEGATIVE
    + ", Crayon Shin-chan, anime IP characters, Disney, manga face close-up, "
    "photoreal, glossy 3D, neon, cyberpunk, empty barren landscape"
)

# public 文件名映射（与 layout vignette 路径一致）
PUBLIC_MAP = {
    "overview": "00_overview.png",
    "antioch_send": "01_antioch_send.png",
    "cyprus": "02_cyprus.png",
    "pisidian_antioch": "03_pisidian_antioch.png",
    "lystra": "04_lystra.png",
    "iconium": "05_iconium.png",
    "derbe": "06_derbe.png",
}

BRIEF = {
    "id": "paul_first_journey_parchment",
    "title_zh": "保罗第一次宣教 · 手绘纸稿",
    "category": "叙事·行程分图·羊皮纸手绘",
    "refs": ["使徒行传 13–14"],
    "era_geo": (
        "1st century AD Roman world; Syrian Antioch, Cyprus, southern Asia Minor; "
        "Levantine / Greco-Roman provincial dress; oil lamps, scrolls, wooden sailing ship"
    ),
    "style_brief": (
        "hand-drawn ink on parchment; vintage manuscript cartoon; original walker duo silhouettes; "
        "Mediterranean teal + terracotta; no Chinese text in pixels"
    ),
    "scripture_text": (
        "他们侍奉主、禁食的时候，圣灵说：要为我分派巴拿巴和扫罗，去做我召他们所做的工。"
        "于是禁食祷告，按手在他们头上，就打发他们去了。"
        "他们既被圣灵差遣，就下到西流基，从那里坐船往塞浦路斯去。到了撒拉米，就在犹太人各会堂里传讲神的道。"
        "他们从别加往前行，来到彼西底的安提阿。在安息日进了会堂坐下。"
        "在以哥念同进犹太人的会堂，在那里讲的叫犹太人、希腊人信的很多；但那不顺从的犹太人耸动外邦人，叫他们心里恼恨弟兄。"
        "路司得城里坐着一个两脚无力的人，生来是瘸腿的。保罗定睛看他，说：你起来，两脚站直！他就跳起来，并且行走。"
        "众人看见保罗所做的事，就用吕高尼的话大声说：有神借着人形降临在我们中间了。"
        "对那城的人传了福音，使好些人作门徒，就回路司得、以哥念、安提阿去，坚固门徒的心。"
        "从那里坐船往安提阿去；他们在那里述说神同他们所行的一切事，并神怎样为外邦人开了信道的门。"
    ),
    "must_not": [
        "modern clothes",
        "jeans",
        "sneakers",
        "skateboard",
        "contemporary East Asian prayer circle",
        "text in pixels",
        "map labels",
        "facial close-up",
        "God anthropomorphic",
        "blood",
        "gore",
        "copyrighted anime characters",
    ],
    "details": [
        {
            "id": "overview",
            "label": "行程总览氛围",
            "ref": "使徒行传 13–14",
            "must_see": ["羊皮纸上的示意海岸", "古帆船剪影", "蜿蜒墨线路径无文字"],
            "happen": "跨海向内陆推进的手绘感",
        },
        {
            "id": "antioch_send",
            "label": "安提阿差遣",
            "ref": "使徒行传 13:2-3",
            "must_see": ["室内窗光", "按手祝福远景", "两位行者行囊剪影"],
            "happen": "禁食祷告按手差遣",
        },
        {
            "id": "cyprus",
            "label": "塞浦路斯",
            "ref": "使徒行传 13:4-5",
            "must_see": ["古帆船", "岛屿岸线", "岸上柱廊"],
            "happen": "坐船往塞浦路斯传道",
        },
        {
            "id": "pisidian_antioch",
            "label": "彼西底安提阿",
            "ref": "使徒行传 13:14",
            "must_see": ["会堂讲台区", "听者背影", "经卷灯火"],
            "happen": "安息日在会堂讲道",
        },
        {
            "id": "iconium",
            "label": "以哥念",
            "ref": "使徒行传 14:1-7",
            "must_see": ["会堂门外人群分阵", "行囊起行", "城门远景"],
            "happen": "多人信主也遇逼迫",
        },
        {
            "id": "lystra",
            "label": "路司得",
            "ref": "使徒行传 14:8-20",
            "must_see": ["柱廊外邦氛围", "瘸腿站起姿态线索", "举手人群剪影"],
            "happen": "医治后被人当作神",
        },
        {
            "id": "derbe",
            "label": "特庇",
            "ref": "使徒行传 14:20-22",
            "must_see": ["城门口教导圈", "门徒围坐", "归途山路"],
            "happen": "传福音并坚固门徒",
        },
    ],
}


def assemble_parchment_prompt(prompt_en: str, negative: str | None = None) -> str:
    final = norm_text(prompt_en) + PARCHMENT_STYLE_SUFFIX
    neg = norm_text(negative) or PARCHMENT_NEGATIVE
    final += " Avoid: " + neg
    return final


def env_key(name: str) -> str:
    import os

    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"missing {name}")
    return v


def gen_image(prompt_en: str, negative: str, raw_path: Path, risk_notes: str | None = None) -> str:
    key = env_key("ZHIPU_API_KEY")
    final = assemble_parchment_prompt(prompt_en, negative)
    body = {
        "model": IMG_MODEL,
        "prompt": final,
        "size": SIZE,
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
            with urllib.request.urlopen(req, timeout=200) as resp:
                payload = json.loads(resp.read().decode())
            url = payload["data"][0]["url"]
            urllib.request.urlretrieve(url, raw_path)
            return url
        except Exception as e:
            last = e
            print("retry", raw_path.name, attempt, e, flush=True)
            time.sleep(2 + attempt * 2)
            if "1301" in str(e) or "content" in str(e).lower():
                body["prompt"] = soften_for_1301(final, risk_notes)
    raise last  # type: ignore


def main() -> int:
    load_dotenv(ROOT)
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec-only", action="store_true")
    ap.add_argument("--from-spec", default="")
    ap.add_argument("--skip-public", action="store_true", help="不覆盖 public vignettes")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    raw_dir = OUT / "_raw"
    raw_dir.mkdir(exist_ok=True)

    from_spec = Path(args.from_spec) if args.from_spec else None
    if from_spec and not from_spec.is_absolute():
        from_spec = ROOT / from_spec

    if from_spec and from_spec.exists():
        print("== reuse spec", from_spec, flush=True)
        spec = json.loads(from_spec.read_text(encoding="utf-8"))
    else:
        print("== deepseek write parchment", flush=True)
        spec = deepseek_write(BRIEF)
        spec_path = OUT / "deepseek_spec.json"
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("wrote", spec_path.relative_to(ROOT), flush=True)

    warns = spec.get("_validation_warnings") or validate_writer_spec(spec)
    if warns:
        print("WARN:", "; ".join(warns), flush=True)

    if args.spec_only:
        print("SPEC_ONLY", flush=True)
        return 0

    print("==", IMG_MODEL, SIZE, "parchment fill", flush=True)
    jobs = []
    for i, d in enumerate(spec.get("details") or []):
        did = d.get("id") or f"d{i+1}"
        raw = raw_dir / f"{i:02d}_{did}.png"
        clean = OUT / f"{PUBLIC_MAP.get(did, f'{i:02d}_{did}.png')}"
        url = gen_image(
            d.get("prompt_en") or "",
            d.get("negative") or PARCHMENT_NEGATIVE,
            raw,
            risk_notes=d.get("risk_notes"),
        )
        clean.write_bytes(raw.read_bytes())
        jobs.append({"id": did, "path": str(clean.relative_to(ROOT)), "url": url})
        print("ok", did, "→", clean.name, flush=True)
        time.sleep(0.8)

    (OUT / "index.json").write_text(
        json.dumps(
            {
                "id": "paul_parchment",
                "style": "hand-drawn parchment §19.14.16",
                "model": IMG_MODEL,
                "jobs": jobs,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    if not args.skip_public:
        PUBLIC_PAUL.mkdir(parents=True, exist_ok=True)
        bak = PUBLIC_PAUL / "_bak_pre_parchment"
        bak.mkdir(exist_ok=True)
        for did, fname in PUBLIC_MAP.items():
            src = OUT / fname
            if not src.is_file():
                continue
            dst = PUBLIC_PAUL / fname
            if dst.is_file():
                shutil.copy2(dst, bak / fname)
            shutil.copy2(src, dst)
            print("public", dst.relative_to(ROOT), flush=True)

    print("ALL_OK", len(jobs), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
