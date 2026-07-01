"""轻量文本审核钩子（群打卡/任务）。

MVP：本地关键词黑名单 + 长度限制。预留 `moderate_text` 作为接入第三方
审核（如内容安全 API）的统一入口，后续替换实现即可。
"""
from __future__ import annotations

import re

# 违禁词（示例集合，生产从配置/远端拉取）
_BLOCKLIST = {
    "广告", "加微信", "代购", "色情", "赌博", "诈骗", "fuck", "shit",
}
# 简单的联系方式/外链（导流）模式
_PATTERNS = [
    re.compile(r"(?:https?://|www\.)\S+", re.I),  # 外链
    re.compile(r"(?<!\d)(?:1[3-9]\d{9})(?!\d)"),    # 手机号
    re.compile(r"[Vv]:?\s*[A-Za-z0-9_-]{5,}"),       # 微信号导流
]

MAX_LEN = 1000


class ModerationError(Exception):
    """审核未通过。"""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def moderate_text(text: str | None) -> None:
    """对文本做审核，违规抛 ModerationError。空文本直接通过。"""
    if not text:
        return
    if len(text) > MAX_LEN:
        raise ModerationError("内容过长")
    low = text.lower()
    for w in _BLOCKLIST:
        if w in low:
            raise ModerationError("内容包含不当词汇")
    for pat in _PATTERNS:
        if pat.search(text):
            raise ModerationError("内容疑似含联系方式或外链")
