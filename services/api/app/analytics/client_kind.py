"""客户端类型：首次触达写入 UV / 获客，不覆盖。"""
from __future__ import annotations

CLIENT_KINDS = frozenset(
    {
        "pwa",  # 已保存到主屏幕 / 桌面 App（standalone）
        "browser",  # 系统浏览器临时访问
        "inapp",  # 微信等内置浏览器
        "ios",  # 原生 iOS
        "android",  # 原生 Android
        "unknown",
    }
)

CLIENT_KIND_LABELS: dict[str, str] = {
    "pwa": "PWA",
    "browser": "浏览器",
    "inapp": "内置浏览器",
    "ios": "iOS App",
    "android": "Android App",
    "unknown": "未知",
}


def normalize_client_kind(value: str | None) -> str | None:
    raw = (value or "").strip().lower()
    if not raw:
        return None
    # 兼容细分类
    if raw in ("standalone", "desktop_pwa", "ios_pwa", "android_pwa"):
        return "pwa"
    if raw in ("web", "mobile_web", "desktop"):
        return "browser"
    if raw in ("wechat", "micromessenger", "in-app"):
        return "inapp"
    if raw in ("native_ios", "flutter_ios"):
        return "ios"
    if raw in ("native_android", "flutter_android"):
        return "android"
    if raw in CLIENT_KINDS:
        return raw
    return "unknown"


def client_kind_label(value: str | None) -> str:
    kind = normalize_client_kind(value) or "unknown"
    return CLIENT_KIND_LABELS.get(kind, kind)
