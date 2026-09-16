#!/usr/bin/env python3
"""§19.14.6 + §19.14.11 视觉卡：DeepSeek 写词 → 智谱出图。

写词权威：scripts/lib/visual_prompt_writer.py（对齐 PRODUCT §19.14.6）。
行程总览不生位图（SVG schematic）；只生成 vignette 分图。

用法：
  python scripts/gen_visual_card_v311.py paul --spec-only
  python scripts/gen_visual_card_v311.py wilderness
  python scripts/gen_visual_card_v311.py both
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lib.visual_prompt_writer import (  # noqa: E402
    assemble_zhipu_prompt,
    deepseek_write,
    load_dotenv,
    soften_for_1301,
    validate_writer_spec,
)

DISCLAIMER = "释义说明，仅供参考"
IMG_MODEL = "cogview-3-flash"
SIZE = "1440x720"
ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/images/generations"


def env_key(name: str) -> str:
    import os

    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"missing {name}")
    return v


def load_font(size: int):
    from PIL import ImageFont

    for p in (
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ):
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size, index=0)
            except Exception:
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
    return ImageFont.load_default()


def pill(draw, xy, text, font, fg=(44, 40, 37), bg=(255, 255, 255, 235), pad=7, radius=9):
    x, y = xy
    bb = draw.textbbox((0, 0), text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    rect = [x - pad, y - pad, x + tw + pad, y + th + pad]
    draw.rounded_rectangle(rect, radius=radius, fill=bg)
    draw.text((x, y), text, font=font, fill=fg)
    return tw + pad * 2


def overlay_beat(raw: Path, out: Path, title: str, ref: str, happen: str, chips: list):
    """样张预览叠字（入库产品面优先 clean + UI；此仅方便本地审阅）。"""
    from PIL import Image, ImageDraw

    im = Image.open(raw).convert("RGBA")
    w, h = im.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    band_h = int(h * 0.28)
    band = Image.new("RGBA", (w, band_h), (247, 243, 236, 238))
    layer.paste(band, (0, h - band_h), band)
    d = ImageDraw.Draw(layer)
    m = int(w * 0.03)
    d.text((m, h - band_h + int(h * 0.025)), title, font=load_font(max(34, w // 30)), fill=(44, 40, 37))
    d.text((m, h - band_h + int(h * 0.08)), ref or "", font=load_font(max(17, w // 58)), fill=(90, 84, 76))
    if happen:
        happen = happen.strip()
        if len(happen) > 18:
            happen = happen[:18] + "…"
        d.text((m, h - band_h + int(h * 0.135)), happen, font=load_font(max(22, w // 45)), fill=(55, 50, 45))
    cf = load_font(max(15, w // 72))
    x, y = m, h - band_h + int(h * 0.195)
    for c in (chips or [])[:4]:
        tw = pill(d, (x + 6, y), c, cf)
        x += tw + 8
        if x > w - m - 40:
            break
    df = load_font(max(13, w // 95))
    db = d.textbbox((0, 0), DISCLAIMER, font=df)
    d.text((w - m - (db[2] - db[0]), h - m - (db[3] - db[1])), DISCLAIMER, font=df, fill=(110, 104, 96))
    Image.alpha_composite(im, layer).convert("RGB").save(out, quality=92)


def gen_image(prompt_en: str, negative: str, raw_path: Path, risk_notes: str | None = None) -> tuple[str, str]:
    key = env_key("ZHIPU_API_KEY")
    final = assemble_zhipu_prompt(prompt_en, negative)
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
            return url, final
        except Exception as e:
            last = e
            print("retry", raw_path.name, attempt, e, flush=True)
            time.sleep(2 + attempt * 2)
            if "1301" in str(e) or "content" in str(e).lower():
                body["prompt"] = soften_for_1301(final, risk_notes)
    raise last  # type: ignore


def write_html(out_dir: Path, meta: dict, spec: dict):
    figs = []
    for j in meta.get("jobs") or []:
        p = Path(j["path"]).name
        title = j["id"]
        happen = j.get("happen") or ""
        figs.append(
            f'<figure><img src="{p}" alt="{title}" />'
            f'<figcaption><strong>{title}</strong> · {happen}</figcaption></figure>'
        )
    html = f"""<!DOCTYPE html>
<html lang="zh-Hans"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{meta.get('title') or meta['id']}</title>
<style>
body{{margin:0;font-family:PingFang SC,Noto Sans SC,sans-serif;background:#f7f3ec;color:#2c2825}}
main{{max-width:920px;margin:0 auto;padding:24px 16px 64px}}
h1{{font-size:1.3rem;margin:0 0 8px}}
.lead{{color:#6e675f;line-height:1.5;margin:0 0 20px}}
img{{width:100%;border-radius:10px;display:block}}
figcaption{{margin:8px 0 24px;color:#6e675f;font-size:.9rem}}
</style></head><body><main>
<h1>{meta.get('title') or ''}</h1>
<p class="lead">{spec.get('guide_one_liner') or ''} · §19.14.6 写词 · 释义说明，仅供参考 · 总览走 SVG</p>
{''.join(figs)}
</main></body></html>"""
    (out_dir / "index.html").write_text(html, encoding="utf-8")


def run_pack(
    pack_id: str,
    out_dir: Path,
    brief: dict,
    *,
    spec_only: bool = False,
    from_spec: Path | None = None,
    bake_overlay: bool = False,
):
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = out_dir / "_raw"
    raw_dir.mkdir(exist_ok=True)

    if from_spec and from_spec.exists():
        print("== reuse spec", from_spec.relative_to(ROOT), flush=True)
        spec = json.loads(from_spec.read_text(encoding="utf-8"))
    else:
        print("== deepseek write", pack_id, flush=True)
        spec = deepseek_write(brief)
        spec_path = out_dir / "deepseek_spec_v314.json"
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (out_dir / "deepseek_spec_v311.json").write_text(
            json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print("wrote", spec_path.relative_to(ROOT), "details", len(spec.get("details") or []), flush=True)

    warns = spec.get("_validation_warnings") or validate_writer_spec(spec)
    if warns:
        print("WARN writer:", "; ".join(warns), flush=True)

    if spec_only:
        print("SPEC_ONLY", pack_id, flush=True)
        return spec

    print("== image model", IMG_MODEL, SIZE, flush=True)
    jobs = []
    for i, d in enumerate((spec.get("details") or [])[:7]):
        did = d.get("id") or f"d{i+1}"
        raw = raw_dir / f"{i+1:02d}_{did}_v314.png"
        # clean 无字
        clean = out_dir / f"{i+1:02d}_{did}_clean.png"
        url, _final = gen_image(
            d.get("prompt_en") or "",
            d.get("negative") or "",
            raw,
            risk_notes=d.get("risk_notes"),
        )
        clean.write_bytes(raw.read_bytes())
        outp = out_dir / f"{i+1:02d}_{did}.png"
        if bake_overlay:
            overlay_beat(
                raw,
                outp,
                d.get("label") or did,
                d.get("ref") or "",
                d.get("happen") or "",
                d.get("beat_chips") or [],
            )
        else:
            # 默认：干净图即交付；讲解走知识信息页 / UI（§19.14.12）
            outp.write_bytes(raw.read_bytes())
        jobs.append(
            {
                "id": did,
                "path": str(outp),
                "clean": str(clean),
                "url": url,
                "happen": d.get("happen"),
                "checklist": d.get("checklist"),
                "verse_anchors": d.get("verse_anchors"),
                "bake_overlay": bake_overlay,
            }
        )
        print("detail ok", did, flush=True)
        time.sleep(0.8)

    meta = {
        "id": pack_id,
        "spec": "visual_cards@19.14.6",
        "title": spec.get("title_zh"),
        "guide_one_liner": spec.get("guide_one_liner"),
        "era_geo": spec.get("era_geo"),
        "skip_overview_bitmap": True,
        "model_image": IMG_MODEL,
        "jobs": jobs,
    }
    (out_dir / "index_v314.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    write_html(out_dir, meta, spec)
    print("ALL_OK", pack_id, len(jobs), flush=True)
    return meta


WILDERNESS = {
    "id": "exodus_wilderness_v314",
    "title_zh": "旷野行程",
    "category": "叙事·行程分图",
    "refs": ["出埃及记 12–19"],
    "era_geo": "Late Bronze Age; Egypt Nile Delta to Sinai wilderness; ancient Near Eastern dress",
    "scripture_text": (
        "以色列人从兰塞起行往疏割；耶和华用大东风使海水一夜退去，水便分开，海就成了干地，"
        "水在他们的左右作了墙垣；以色列人下海中走干地。"
        "到了玛拉，不能喝那里的水，因为水苦；耶和华指示一棵树，他把树丢在水里，水就变甜了。"
        "他们到了以琳，在那里有十二股水泉，七十棵棕树，他们就在那里的水边安营。"
        "耶和华将粮食从天降给你们；早晨，在营的四围的地上有如白霜的小圆物。"
        "你要击打磐石，从磐石就有水流出来，使百姓可以喝。"
        "以色列人出埃及地以后，满了三个月的那一天，就来到西奈的旷野；在那里的山下安营。"
    ),
    "must_not": [
        "water ceiling tunnel",
        "canyon cliffs as Red Sea",
        "Mongolian yurt",
        "modern clothes",
        "text in pixels",
        "facial close-up",
    ],
    "details": [
        {
            "id": "red_sea",
            "label": "过红海",
            "ref": "出埃及记 14:21-29",
            "must_see": ["左右海水墙垣", "中间干海床", "远景行进队伍剪影"],
            "happen": "水分开，百姓走干地",
        },
        {
            "id": "marah",
            "label": "玛拉",
            "ref": "出埃及记 15:23-25",
            "must_see": ["苦泉", "枯枝投入水中", "旷野营地远景"],
            "happen": "苦水变甜",
        },
        {
            "id": "elim",
            "label": "以琳",
            "ref": "出埃及记 15:27",
            "must_see": ["多株棕树", "多股泉源", "安营帐篷"],
            "happen": "十二泉七十棕树歇息",
        },
        {
            "id": "manna",
            "label": "汛的旷野",
            "ref": "出埃及记 16",
            "must_see": ["地面白霜状小圆物", "拾取的器皿/篮子", "晨光旷野"],
            "happen": "吗哪显明可日日拾取",
        },
        {
            "id": "rephidim",
            "label": "利非订",
            "ref": "出埃及记 17:6",
            "must_see": ["裂开的磐石", "流出的水", "击石的杖剪影"],
            "happen": "击打磐石水流出",
        },
        {
            "id": "sinai",
            "label": "西奈山",
            "ref": "出埃及记 19:1-2",
            "must_see": ["高耸山体", "山下帐篷环绕", "云雾环山"],
            "happen": "在西奈山下安营",
        },
    ],
}

PAUL = {
    "id": "paul_first_journey_v314",
    "title_zh": "保罗第一次宣教",
    "category": "叙事·行程分图",
    "refs": ["使徒行传 13–14"],
    "era_geo": (
        "1st century AD Roman world; Syrian Antioch, Cyprus, southern Asia Minor (Galatia); "
        "Levantine / Greco-Roman provincial dress; oil lamps, scrolls, wooden sailing ship"
    ),
    "scripture_text": (
        "他们侍奉主、禁食的时候，圣灵说：要为我分派巴拿巴和扫罗，去做我召他们所做的工。"
        "于是禁食祷告，按手在他们头上，就打发他们去了。"
        "他们既被圣灵差遣，就下到西流基，从那里坐船往塞浦路斯去。到了撒拉米，就在犹太人各会堂里传讲神的道。"
        "他们从别加往前行，来到彼西底的安提阿。在安息日进了会堂坐下。"
        "路司得城里坐着一个两脚无力的人，生来是瘸腿的。保罗定睛看他，说：你起来，两脚站直！他就跳起来，并且行走。"
        "众人看见保罗所做的事，就用吕高尼的话大声说：有神借着人形降临在我们中间了。"
    ),
    "must_not": [
        "modern clothes",
        "jeans",
        "sneakers",
        "contemporary East Asian prayer circle",
        "modern furniture",
        "text in pixels",
        "map labels",
        "facial close-up",
        "God anthropomorphic",
        "blood",
        "gore",
    ],
    "details": [
        {
            "id": "antioch_send",
            "label": "安提阿差遣",
            "ref": "使徒行传 13:2-3",
            "must_see": ["室内窗光", "按手祝福姿态", "聚会围成一圈"],
            "happen": "禁食祷告按手差遣",
        },
        {
            "id": "cyprus",
            "label": "塞浦路斯",
            "ref": "使徒行传 13:4-5",
            "must_see": ["古帆船", "岛屿岸线", "岸上会堂/柱廊"],
            "happen": "坐船往塞浦路斯传道",
        },
        {
            "id": "pisidian_antioch",
            "label": "彼西底安提阿",
            "ref": "使徒行传 13:14",
            "must_see": ["会堂讲台区", "听者背影排坐", "经卷或灯"],
            "happen": "安息日在会堂讲道",
        },
        {
            "id": "lystra",
            "label": "路司得",
            "ref": "使徒行传 14:8-20",
            "must_see": ["柱廊外邦氛围", "瘸腿站起姿态线索", "举手欢呼人群剪影"],
            "happen": "医治后被人当作神",
        },
    ],
}


def main():
    load_dotenv(ROOT)
    ap = argparse.ArgumentParser()
    ap.add_argument("which", nargs="?", default="both", choices=["wilderness", "paul", "both"])
    ap.add_argument(
        "--spec-only",
        action="store_true",
        help="只跑 DeepSeek 写词，不出图",
    )
    ap.add_argument(
        "--from-spec",
        type=str,
        default="",
        help="复用已有 writer JSON，跳过 DeepSeek",
    )
    ap.add_argument(
        "--bake-overlay",
        action="store_true",
        help="样张预览才烤底栏；默认关闭（讲解走知识信息页）",
    )
    args = ap.parse_args()
    from_spec = Path(args.from_spec) if args.from_spec else None
    if from_spec and not from_spec.is_absolute():
        from_spec = ROOT / from_spec

    if args.which in ("wilderness", "both"):
        run_pack(
            "exodus_wilderness_explainer",
            ROOT / "data/visual_cards/samples/exodus_wilderness_v311",
            WILDERNESS,
            spec_only=args.spec_only,
            from_spec=from_spec if args.which == "wilderness" else None,
            bake_overlay=args.bake_overlay,
        )
    if args.which in ("paul", "both"):
        run_pack(
            "paul_first_journey_explainer",
            ROOT / "data/visual_cards/samples/paul_first_journey_v311",
            PAUL,
            spec_only=args.spec_only,
            from_spec=from_spec if args.which in ("paul", "both") else None,
            bake_overlay=args.bake_overlay,
        )


if __name__ == "__main__":
    main()
