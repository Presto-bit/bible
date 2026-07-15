"""文本审核钩子（群闲聊 / 打卡 / 私信）。

MVP：本地关键词 + 导流模式 + 异端渗透词表。
`moderate_text` 为统一入口，后续可换第三方内容安全 API。
"""
from __future__ import annotations

import os
import re

# 通审：广告 / 低俗等
_BLOCKLIST = {
    "广告", "加微信", "代购", "色情", "赌博", "诈骗", "fuck", "shit",
}
# 异端 / 邪教渗透（示例表；生产可用 SOCIAL_HERESY_WORDS 逗号分隔覆盖追加）
_HERESY_BLOCKLIST = {
    "东方闪电", "全能神", "呼喊派", "观音法门", "法轮大法",
    "门徒会", "三班仆人", "血水圣灵", "统一教", "新天地",
}
# 简单的联系方式/外链（导流）模式
_PATTERNS = [
    re.compile(r"(?:https?://|www\.)\S+", re.I),
    re.compile(r"(?<!\d)(?:1[3-9]\d{9})(?!\d)"),
    re.compile(r"[Vv]:?\s*[A-Za-z0-9_-]{5,}"),
]
# 可疑域名（异端常用引流）— 命中外链且含这些域名 → heresy
_HERESY_DOMAINS = {
    "godfootsteps.org",
    "kingdomsalvation.org",
    "holyspiritspeaks.org",
}

MAX_LEN = 2000


class ModerationError(Exception):
    """审核未通过。"""

    def __init__(self, reason: str, category: str = "abuse"):
        self.reason = reason
        self.category = category  # spam | abuse | heresy | illegal
        super().__init__(reason)


def _extra_heresy_words() -> set[str]:
    raw = (os.environ.get("SOCIAL_HERESY_WORDS") or "").strip()
    if not raw:
        return set()
    return {w.strip().lower() for w in raw.split(",") if w.strip()}


def moderate_text(text: str | None) -> None:
    """对文本做审核，违规抛 ModerationError。空文本直接通过。"""
    if not text:
        return
    if len(text) > MAX_LEN:
        raise ModerationError("内容过长", category="abuse")
    low = text.lower()
    heresy = {w.lower() for w in _HERESY_BLOCKLIST} | _extra_heresy_words()
    for w in heresy:
        if w and w in low:
            raise ModerationError("内容疑似违反信仰准则", category="heresy")
    for w in _BLOCKLIST:
        if w in low:
            raise ModerationError("内容包含不当词汇", category="abuse")
    for pat in _PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        hit = m.group(0).lower()
        if any(d in hit for d in _HERESY_DOMAINS):
            raise ModerationError("内容疑似异端引流链接", category="heresy")
        raise ModerationError("内容疑似含联系方式或外链", category="spam")
