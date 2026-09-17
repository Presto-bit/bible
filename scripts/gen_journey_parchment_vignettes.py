#!/usr/bin/env python3
"""行程手稿 · AI 纸稿 vignette（旷野 / 加利利，对齐保罗 §19.14.16）

DeepSeek 写词 → CogView-3-Flash 出干净母题 → public/knowledge/vignettes/{dir}/
再跑 render_comic_dense_infographic + render_station_dense_infographic。

用法：
  python3 scripts/gen_journey_parchment_vignettes.py --id exodus-wilderness
  python3 scripts/gen_journey_parchment_vignettes.py --id jesus-ministry-galilee
  python3 scripts/gen_journey_parchment_vignettes.py --id exodus-wilderness --spec-only
  python3 scripts/gen_journey_parchment_vignettes.py --id exodus-wilderness --from-spec path.json
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

IMG_MODEL = "cogview-3-flash"
SIZE = "1440x720"
ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/images/generations"

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

# tour_id → 样张目录名 / public vignette 子目录 / DeepSeek BRIEF
TOURS: dict[str, dict] = {
    "exodus-wilderness": {
        "sample_dir": "exodus_wilderness_parchment",
        "public_dir": "wilderness",
        "public_map": {
            "overview": "00_overview.png",
            "egypt": "egypt.png",
            "red_sea": "01_red_sea.png",
            "marah": "02_marah.png",
            "elim": "03_elim.png",
            "rephidim": "05_rephidim.png",
            "sinai": "06_sinai.png",
        },
        "brief": {
            "id": "exodus_wilderness_parchment",
            "title_zh": "出埃及 · 旷野行程 · 手绘纸稿",
            "category": "叙事·行程分图·羊皮纸手绘",
            "refs": ["出埃及记 12–19"],
            "era_geo": (
                "Late Bronze Age Egypt and Sinai wilderness; mudbrick store cities, "
                "Reed Sea shore, desert oasis palms, rocky wadis, Mount Sinai massif; "
                "Israelite traveler cloaks, staffs, tents — no modern objects"
            ),
            "style_brief": (
                "hand-drawn ink on parchment; vintage manuscript cartoon; distant traveler silhouettes; "
                "desert ochre + teal water accents; no Chinese text in pixels"
            ),
            "scripture_text": (
                "以色列人因作苦工，就叹息哀求。耶和华吩咐摩西向海伸杖，水便分开，海就成了干地。"
                "到了玛拉，不能喝那里的水，因为水是苦的；耶和华指示一棵树，丢在水里，水就变甜了。"
                "到了以琳，在那里有十二股水泉，七十棵棕树；他们就在那里的水边安营。"
                "百姓在利非订没有水喝；你要击打磐石，从磐石里必有水流出来。"
                "他们出埃及地以后，满了三个月的那一天，就来到西奈的旷野，在山下安营。"
            ),
            "must_not": [
                "modern clothes",
                "text in pixels",
                "map labels",
                "facial close-up",
                "God anthropomorphic",
                "blood",
                "gore",
                "copyrighted anime characters",
                "pharaoh caricature throne comedy",
            ],
            "details": [
                {
                    "id": "overview",
                    "label": "旷野行程总览",
                    "ref": "出埃及记 12–19",
                    "must_see": ["羊皮纸蜿蜒墨线路径", "海岸与沙漠交界", "远景帐篷剪影"],
                    "happen": "从苦役之地走向西奈山下",
                },
                {
                    "id": "egypt",
                    "label": "埃及起行",
                    "ref": "出埃及记 1:11",
                    "must_see": ["泥砖城邑远景", "行进队伍剪影", "旷野边缘"],
                    "happen": "百姓在苦役中起行离开",
                },
                {
                    "id": "red_sea",
                    "label": "红海",
                    "ref": "出埃及记 14:21",
                    "must_see": ["左右海水墙", "干海床通道", "远景队伍"],
                    "happen": "水分开百姓走干地",
                },
                {
                    "id": "marah",
                    "label": "玛拉",
                    "ref": "出埃及记 15:23",
                    "must_see": ["苦泉", "枯枝投入水中线索", "营地远景"],
                    "happen": "苦水变甜",
                },
                {
                    "id": "elim",
                    "label": "以琳",
                    "ref": "出埃及记 15:27",
                    "must_see": ["多株棕树", "泉源", "帐篷歇息"],
                    "happen": "十二泉七十棕树歇息",
                },
                {
                    "id": "rephidim",
                    "label": "利非订",
                    "ref": "出埃及记 17:6",
                    "must_see": ["裂开磐石", "流水", "杖剪影"],
                    "happen": "击打磐石水流出",
                },
                {
                    "id": "sinai",
                    "label": "西奈山",
                    "ref": "出埃及记 19:20",
                    "must_see": ["山体云雾", "环山帐篷", "朝见氛围远景"],
                    "happen": "在西奈山下安营",
                },
            ],
        },
    },
    "jesus-ministry-galilee": {
        "sample_dir": "jesus_galilee_parchment",
        "public_dir": "galilee",
        "public_map": {
            "overview": "00_overview.png",
            "nazareth": "01_nazareth.png",
            "capernaum": "02_capernaum.png",
            "sea_of_galilee": "03_sea_of_galilee.png",
            "bethsaida": "04_bethsaida.png",
            "caesarea_philippi": "05_caesarea_philippi.png",
            "olives": "06_olives.png",
            "jerusalem": "07_jerusalem.png",
        },
        "brief": {
            "id": "jesus_galilee_parchment",
            "title_zh": "耶稣加利利事工 · 手绘纸稿",
            "category": "叙事·行程分图·羊皮纸手绘",
            "refs": ["马太福音", "路加福音"],
            "era_geo": (
                "1st century Galilee and Judea; Nazareth hillside town, Capernaum lakeside, "
                "Sea of Galilee fishing boats, Bethsaida shore, Caesarea Philippi rocky foothills, "
                "Mount of Olives overlooking Jerusalem — Levantine robes, no modern objects"
            ),
            "style_brief": (
                "hand-drawn ink on parchment; vintage manuscript cartoon; distant disciple group silhouettes; "
                "lake teal + olive green + warm stone; no Chinese text in pixels"
            ),
            "scripture_text": (
                "耶稣来到拿撒勒，在安息日进了会堂，站起来要念圣经。"
                "又离开拿撒勒，往迦百农去，就住在那里。"
                "耶稣在加利利海边行走，看见西门和安德烈，就说：来跟从我，我要叫你们得人如得鱼一样。"
                "你们给他们吃吧；他们就都吃，并且吃饱了。"
                "西门彼得回答说：你是基督，是永生神的儿子。"
                "耶稣在橄榄山上，门徒暗暗地来说：请告诉我们，什么时候有这些事。"
                "要对锡安的居民说：看哪，你的王来到你这里，是温柔的，又骑着驴。"
            ),
            "must_not": [
                "modern clothes",
                "text in pixels",
                "map labels",
                "facial close-up of Jesus",
                "halo photoreal Jesus portrait",
                "God anthropomorphic",
                "blood",
                "gore",
                "copyrighted anime characters",
                "Western cathedral interior",
            ],
            "details": [
                {
                    "id": "overview",
                    "label": "加利利事工总览",
                    "ref": "福音书",
                    "must_see": ["湖区示意墨线", "渔船剪影", "南向圣城远影"],
                    "happen": "从加利利起行收束至耶路撒冷",
                },
                {
                    "id": "nazareth",
                    "label": "拿撒勒",
                    "ref": "路加福音 4:16",
                    "must_see": ["会堂卷轴线索", "乡邻围观剪影", "起身离城"],
                    "happen": "家乡会堂宣告恩年",
                },
                {
                    "id": "capernaum",
                    "label": "迦百农",
                    "ref": "马太福音 4:13",
                    "must_see": ["湖岸石屋", "会堂门廊", "病患走近远景"],
                    "happen": "以湖城为事工中心",
                },
                {
                    "id": "sea_of_galilee",
                    "label": "加利利海",
                    "ref": "马太福音 4:18",
                    "must_see": ["渔网船舷", "岸边脚印", "跟随背影"],
                    "happen": "海边呼召得人的渔夫",
                },
                {
                    "id": "bethsaida",
                    "label": "伯赛大",
                    "ref": "路加福音 9:10",
                    "must_see": ["碎饼篮筐线索", "坐地人群", "青草坡地"],
                    "happen": "五饼二鱼喂饱众人",
                },
                {
                    "id": "caesarea_philippi",
                    "label": "该撒利亚腓立比",
                    "ref": "马太福音 16:13",
                    "must_see": ["山麓磐石", "门徒围圈", "远望北方"],
                    "happen": "彼得认祂为基督",
                },
                {
                    "id": "olives",
                    "label": "橄榄山",
                    "ref": "马太福音 24:3",
                    "must_see": ["橄榄山脊", "圣城轮廓", "门徒侧听"],
                    "happen": "面向圣城讲论末后",
                },
                {
                    "id": "jerusalem",
                    "label": "耶路撒冷",
                    "ref": "马太福音 21:1",
                    "must_see": ["城门棕枝", "圣殿远景", "窄路上行"],
                    "happen": "荣入圣城走向十架",
                },
            ],
        },
    },
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
    ap.add_argument("--id", required=True, choices=sorted(TOURS.keys()))
    ap.add_argument("--spec-only", action="store_true")
    ap.add_argument("--from-spec", default="")
    ap.add_argument("--skip-public", action="store_true")
    args = ap.parse_args()

    conf = TOURS[args.id]
    out = ROOT / "data/visual_cards/samples" / conf["sample_dir"]
    public = ROOT / "apps/web/public/knowledge/vignettes" / conf["public_dir"]
    public_map: dict[str, str] = conf["public_map"]
    brief = conf["brief"]

    out.mkdir(parents=True, exist_ok=True)
    raw_dir = out / "_raw"
    raw_dir.mkdir(exist_ok=True)

    from_spec = Path(args.from_spec) if args.from_spec else None
    if from_spec and not from_spec.is_absolute():
        from_spec = ROOT / from_spec

    if from_spec and from_spec.exists():
        print("== reuse spec", from_spec, flush=True)
        spec = json.loads(from_spec.read_text(encoding="utf-8"))
    else:
        print("== deepseek write parchment", args.id, flush=True)
        spec = deepseek_write(brief)
        spec_path = out / "deepseek_spec.json"
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("wrote", spec_path.relative_to(ROOT), flush=True)

    warns = spec.get("_validation_warnings") or validate_writer_spec(spec)
    if warns:
        print("WARN:", "; ".join(warns), flush=True)

    # DeepSeek 偶发漏掉 overview：用 BRIEF 补回
    have_ids = {d.get("id") for d in (spec.get("details") or [])}
    want_ids = [d["id"] for d in brief["details"]]
    missing = [i for i in want_ids if i not in have_ids]
    if missing:
        print("== patch missing detail ids", missing, flush=True)
        patch_brief = {**brief, "details": [d for d in brief["details"] if d["id"] in missing]}
        patch = deepseek_write(patch_brief)
        by_id = {d.get("id"): d for d in (spec.get("details") or [])}
        for d in patch.get("details") or []:
            if d.get("id"):
                by_id[d["id"]] = d
        spec["details"] = [by_id[i] for i in want_ids if i in by_id] + [
            d for d in (spec.get("details") or []) if d.get("id") not in want_ids
        ]
        (out / "deepseek_spec.json").write_text(
            json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    if args.spec_only:
        print("SPEC_ONLY", flush=True)
        return 0

    print("==", IMG_MODEL, SIZE, "parchment fill", args.id, flush=True)
    jobs = []
    for i, d in enumerate(spec.get("details") or []):
        did = d.get("id") or f"d{i+1}"
        fname = public_map.get(did, f"{i:02d}_{did}.png")
        raw = raw_dir / f"{i:02d}_{did}.png"
        clean = out / fname
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

    (out / "index.json").write_text(
        json.dumps(
            {
                "id": brief["id"],
                "tour_id": args.id,
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
        public.mkdir(parents=True, exist_ok=True)
        bak = public / "_bak_pre_parchment"
        bak.mkdir(exist_ok=True)
        for did, fname in public_map.items():
            src = out / fname
            if not src.is_file():
                continue
            dst = public / fname
            if dst.is_file():
                shutil.copy2(dst, bak / fname)
            shutil.copy2(src, dst)
            print("public", dst.relative_to(ROOT), flush=True)

    print("ALL_OK", args.id, len(jobs), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
