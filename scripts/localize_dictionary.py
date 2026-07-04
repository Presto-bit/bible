#!/usr/bin/env python3
"""汉化词典词条：英文专名 → 中文，无效摘要（Male/City）→ 中文说明。

用法：
  python scripts/localize_dictionary.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.bible_names_zh import FEATURE_ZH, TYPE_ZH, zh_name

REPO = Path(__file__).resolve().parent.parent
ENTITIES = REPO / "data" / "dictionary" / "entities.json"

# 关键词条固定释义（覆盖 Gnosis 性别标签等无效摘要）
CURATED_SUMMARIES: dict[str, str] = {
    "神": "创造天地的独一真神，圣经启示与敬拜的中心。",
    "主": "对耶和华或耶稣基督的尊称，表明主权与敬拜对象。",
    "圣灵": "三位一体中的圣灵，赐生命、引导并内住信徒。",
    "撒但": "抵挡神的恶者，又称魔鬼，试探并控告人。",
    "基督": "受膏者、弥赛亚；指耶稣为神所立的君王与救主。",
    "以色列": "雅各的别名，也指神的选民及其后裔所建之国。",
    "耶路撒冷": "以色列的京城与圣殿所在，救恩历史的中心。",
}

BAD_SUMMARY = re.compile(
    r"^(Male|Female|Place|City|Town|Village|Region|Mountain|Hill|River|Sea|"
    r"Lake|Valley|Desert|Island|Country|Nation|Person|Term|"
    r"[\w\s,.\-'\"()/]{1,40})$"
)


def _has_cjk(s: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in (s or ""))


def _is_bad_summary(s: str) -> bool:
    s = (s or "").strip()
    if not s:
        return True
    if not _has_cjk(s):
        return True
    # 仅含英文/性别标签
    if BAD_SUMMARY.match(s) and not _has_cjk(s):
        return True
    return False


def _make_summary(ent: dict, name_zh: str) -> str:
    if name_zh in CURATED_SUMMARIES:
        return CURATED_SUMMARIES[name_zh]
    t = ent.get("type") or "term"
    type_label = TYPE_ZH.get(t, "词条")
    old = (ent.get("summary") or "").strip()
    # 神/灵界不展示性别标签
    skip_gender = name_zh in {"神", "主", "圣灵", "撒但", "基督", "天使"}
    bits: list[str] = []
    for part in re.split(r"[；;]", old):
        part = part.strip()
        if not part:
            continue
        if part in ("Male", "Female", "男性", "女性") and skip_gender:
            continue
        if part in FEATURE_ZH:
            label = FEATURE_ZH[part]
            if label in ("男性", "女性") and skip_gender:
                continue
            bits.append(label)
            continue
        m = re.match(r"^(City|Town|Region|Place|Mountain)\s*[（(](.+?)[）)]$", part)
        if m:
            bits.append(f"{FEATURE_ZH.get(m.group(1), m.group(1))}（{m.group(2)}）")
            continue
        if part.startswith("约 ") or _has_cjk(part):
            bits.append(part)
    extra = "，".join(bits)
    base = f"圣经中的{type_label}「{name_zh}」" if t in ("person", "place") else f"圣经{type_label}「{name_zh}」"
    if extra and extra != name_zh:
        return f"{base}（{extra}）。"
    return f"{base}。"


def main() -> int:
    data = json.loads(ENTITIES.read_text(encoding="utf-8"))
    entities = data.get("entities") or []

    localized = 0
    summary_fixed = 0
    dropped = 0
    by_id: dict[str, dict] = {}

    for ent in entities:
        en_name = (ent.get("name") or "").strip()
        mapped = zh_name(en_name)
        eid = (ent.get("id") or en_name).strip()

        if mapped:
            if mapped != en_name:
                aliases = list(ent.get("aliases") or [])
                if en_name and en_name not in aliases:
                    aliases.insert(0, en_name)
                ent["aliases"] = aliases
                ent["name"] = mapped
                localized += 1
            name_zh = mapped
        elif _has_cjk(en_name):
            name_zh = en_name
        else:
            # 无法汉化的英文词条：不进入面向用户的词典
            dropped += 1
            continue

        if name_zh in CURATED_SUMMARIES:
            # 仅当原摘要无效时覆盖，避免冲掉手工长释义
            if _is_bad_summary(ent.get("summary") or ""):
                ent["summary"] = CURATED_SUMMARIES[name_zh]
                summary_fixed += 1
        elif _is_bad_summary(ent.get("summary") or ""):
            ent["summary"] = _make_summary(ent, name_zh)
            summary_fixed += 1
        elif not _has_cjk(ent.get("summary") or ""):
            ent["summary"] = _make_summary(ent, name_zh)
            summary_fixed += 1

        by_id[eid] = ent

    # 同名：有消歧的全部保留；无消歧的合并，且若已有消歧条目则丢弃无消歧的 gnosis 重复
    best_by_name: dict[str, dict] = {}
    with_disamb: list[dict] = []
    names_with_disamb: set[str] = set()
    for ent in by_id.values():
        disamb = (ent.get("disambiguation") or "").strip()
        if disamb:
            with_disamb.append(ent)
            names_with_disamb.add(ent["name"])
            continue
        key = ent["name"]
        prev = best_by_name.get(key)
        if prev is None:
            best_by_name[key] = ent
            continue
        prev_score = (0 if prev.get("source") == "gnosis" else 3) + len(prev.get("summary") or "")
        cur_score = (0 if ent.get("source") == "gnosis" else 3) + len(ent.get("summary") or "")
        if cur_score > prev_score:
            best_by_name[key] = ent
    kept = list(with_disamb)
    for name, ent in best_by_name.items():
        if name in names_with_disamb:
            continue  # 已有消歧条目（如两个「约翰」），不再挂无消歧的英文重复
        kept.append(ent)


    data["entities"] = kept
    data["count"] = len(kept)
    data["schema"] = "entities@3"
    data["source"] = "手工 + gnosis 汉化 (CC-BY-SA)"
    ENTITIES.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"✓ 词典汉化：保留 {len(kept)} 条 / 译名 {localized} / "
        f"摘要修复 {summary_fixed} / 丢弃英文未译 {dropped}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
