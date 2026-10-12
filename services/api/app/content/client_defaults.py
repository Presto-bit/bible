"""双端共享默认规则（单一真相，防 Web↔Flutter 漂移）。"""


def client_defaults_payload() -> dict:
    return {
        "version": 1,
        "reminders": {
            # PRODUCT §2.6.1：提醒默认关，读经勿扰默认开
            "daily_reading_enabled_default": False,
            "reading_dnd_default": True,
        },
        "home": {
            "rail_slot_min": 1,
            "rail_slot_max": 4,
            "warm_excluded_from_uv": True,
        },
        "discover": {
            "tab_bar_unread_badge": False,
        },
        "copy": {
            "guilt_free": True,
            "reminder_body_hint": "愿话语成为你脚前的灯 · 今日也可打开圣经读一章",
        },
    }
