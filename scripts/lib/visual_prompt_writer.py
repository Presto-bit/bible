"""§19.14.6 DeepSeek Prompt Writer · 彼爱视觉卡写词（共享）。

权威：docs/PRODUCT.md §19.14.6。
图像模型只吃英文空间描述；中文标题/happen 一律后处理或 UI。
行程总览位图不在此写词（改走 SVG schematic，§19.14.12/14）。
"""

from __future__ import annotations

import json
import os
import re
import ssl
import urllib.request
from typing import Any

ctx = ssl.create_default_context()

# 智谱侧固定尾句（§19.14.6「智谱侧拼装」）
ZHIPU_STYLE_SUFFIX = (
    " Quiet paper-like flat educational Bible illustration; muted warm gray and ochre, soft teal accents; "
    "soft side light; dense readable foreground motifs; not photorealistic, not cinematic poster, not sci-fi. "
    "Absolutely no text, letters, numbers, captions, watermarks, title bars, or map labels in the image pixels."
)

DEFAULT_NEGATIVE = (
    "text, letters, numbers, captions, watermark, title bar, map labels, Chinese characters, "
    "modern clothes, jeans, sneakers, skateboard, wheeled board, contemporary East Asian prayer group, modern furniture, "
    "photorealistic faces, facial close-up, God anthropomorphic, blood, gore, "
    "empty barren landscape, sparse cinematic poster, huge empty sky, "
    "water ceiling tunnel, canyon cliffs as Red Sea, Mongolian yurt as tabernacle, "
    "national flags, modern borders"
)

# §19.14.6 DeepSeek「Prompt Writer」System（定稿）
PROMPT_WRITER_SYSTEM = """你是圣经视觉顾问 + 文生图提示词工程师。只输出一个 JSON，勿解释。

权威规则（彼爱 PRODUCT §19.14.6）：
1. 先读 scripture_text：在每条 beat 的 verse_anchors 中列出将可视化的经文原句（中文短引，可截断）及其对应画面动作（visual 用英文空间描述）。
2. prompt_en 必须由原文驱动：把原文关键名词/动作译成可画元素。不得用与原文无关的科幻、现代场景替换（例：过红海≠水顶隧道/岩壁峡谷；会幕≠蒙古包）。
3. 不得发明经文未写、又会改变叙事的核心情节；细节补全仅限服饰/光影/地理常识，且写入 inferences，标明「推断非原文」。
4. 风格锁死：quiet paper-like flat illustration；muted warm gray / ochre；soft side light；not photorealistic cinematic / sci-fi。
5. 画面禁止任何文字、字母、数字、水印、标题条、地图站名标注（中文标题与「释义说明，仅供参考」一律后处理叠字或 UI）。
6. 禁止：God anthropomorphic；faces close-up；blood/gore；modern clothes / jeans / sneakers；contemporary East Asian indoor fellowship aesthetic；national flags；modern political borders。
7. 时代与地理：严格遵守卡片简报的 era_geo；服饰须像该时代该地区（写入 inferences），人物仅远景剪影或背影。
8. 行程类 path overview：不要写 bitmap 总览 prompt（总览由客户端 SVG schematic 承担）。只为 details / vignette 写词。
9. 每条 detail：must_see ≥3 可辨母题进 prompt_en；happen ≤14 汉字；beat_chips 2–3 个短词；prompt_en 约 200–360 英文词，开篇点明由哪些经文动作构成。

输出 JSON schema（一个对象）：
{
  "title_zh": "string",
  "guide_one_liner": "string",
  "era_geo": "echo from brief",
  "skip_overview_bitmap": true,
  "overview_note": "path overview uses SVG schematic; no bitmap prompt",
  "details": [
    {
      "id": "string",
      "label": "string",
      "ref": "string",
      "happen": "≤14汉字",
      "beat_chips": ["短词", "短词"],
      "verse_anchors": [{"quote": "经文短引", "visual": "English drawable action"}],
      "inferences": ["1st-c. Levantine robes — costume only, not in verse"],
      "prompt_en": "200–360 words English…",
      "negative": "modern clothes, text, faces close-up, …",
      "checklist": ["motif1", "motif2", "motif3"],
      "overlays": [{"label": "中文轻锚", "hint": "placement_hint"}],
      "risk_notes": "若智谱1301：保留形制动词，弱化专名"
    }
  ]
}
"""


def load_dotenv(root) -> None:
    for p in (root / ".env", root / "services/api/.env", root / ".env.production"):
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"missing {name}")
    return v


def validate_brief(brief: dict) -> list[str]:
    """卡片简报最小字段（§19.14.6）。返回错误列表。"""
    errs: list[str] = []
    for k in ("id", "title_zh", "refs", "scripture_text", "era_geo"):
        if not brief.get(k):
            errs.append(f"missing brief.{k}")
    if not (brief.get("scripture_text") or "").strip():
        errs.append("scripture_text empty")
    details = brief.get("details") or []
    if not details:
        errs.append("missing brief.details")
    for i, d in enumerate(details):
        if not d.get("must_see"):
            errs.append(f"details[{i}].must_see missing")
        if not d.get("id"):
            errs.append(f"details[{i}].id missing")
    return errs


def validate_writer_spec(spec: dict) -> list[str]:
    errs: list[str] = []
    details = spec.get("details") or []
    if not details:
        errs.append("spec.details empty")
    for i, d in enumerate(details):
        prefix = f"details[{i}]({d.get('id')})"
        if not d.get("prompt_en"):
            errs.append(f"{prefix}: missing prompt_en")
        if not d.get("verse_anchors"):
            errs.append(f"{prefix}: missing verse_anchors")
        if not d.get("checklist"):
            errs.append(f"{prefix}: missing checklist")
        if not d.get("negative"):
            errs.append(f"{prefix}: missing negative")
        happen = (d.get("happen") or "").strip()
        if happen and len(happen) > 16:
            errs.append(f"{prefix}: happen too long ({len(happen)})")
    return errs


def norm_text(p: Any) -> str:
    if isinstance(p, list):
        return " ".join(str(x) for x in p)
    return (p or "").strip()


def assemble_zhipu_prompt(prompt_en: str, negative: str | None = None) -> str:
    """§19.14.6 智谱侧拼装：prompt_en + 固定尾句 + Avoid:negative。"""
    final = norm_text(prompt_en) + ZHIPU_STYLE_SUFFIX
    neg = norm_text(negative) or DEFAULT_NEGATIVE
    final += " Avoid: " + neg
    return final


def soften_for_1301(prompt: str, risk_notes: str | None = None) -> str:
    """敏感拦截时弱化专名，尽量保留形制动词。"""
    out = (
        prompt.replace("synagogue", "meeting house")
        .replace("Synagogue", "meeting house")
        .replace("temple", "columned hall")
        .replace("Temple", "columned hall")
        .replace("God", "divine presence suggested only by light")
        .replace("pagan", "civic")
    )
    if risk_notes:
        out += " (" + risk_notes.strip() + ")"
    return out


def deepseek_write(brief: dict, *, system: str = PROMPT_WRITER_SYSTEM) -> dict:
    """调用 DeepSeek，返回 writer JSON。"""
    errs = validate_brief(brief)
    if errs:
        raise SystemExit("brief invalid: " + "; ".join(errs))

    key = env("DEEPSEEK_API_KEY")
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
    model = os.environ.get("DEEPSEEK_TEXT_MODEL", "deepseek-v4-flash")

    # 喂给模型前去掉过时的 overview 位图暗示，避免再写总览 prompt
    payload = dict(brief)
    payload.pop("overview_must", None)
    payload.pop("output_schema_hint", None)
    payload["layout_policy"] = (
        "vignette details only; skip_overview_bitmap=true; path overview is SVG not AI bitmap"
    )
    payload["must_not_global"] = brief.get("must_not") or [
        "modern clothes",
        "text in pixels",
        "facial close-up",
        "God anthropomorphic",
        "contemporary East Asian fellowship room",
    ]

    body = {
        "model": model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=ctx, timeout=180) as resp:
        chat = json.loads(resp.read().decode())
    content = chat["choices"][0]["message"]["content"]
    content = re.sub(r"^```json\s*|\s*```$", "", content.strip())
    spec = json.loads(content)

    # 强制纪律字段
    spec["skip_overview_bitmap"] = True
    if not spec.get("era_geo"):
        spec["era_geo"] = brief.get("era_geo")
    if not spec.get("overview_note"):
        spec["overview_note"] = "path overview uses SVG schematic; no bitmap prompt"

    warn = validate_writer_spec(spec)
    if warn:
        spec["_validation_warnings"] = warn
    return spec
