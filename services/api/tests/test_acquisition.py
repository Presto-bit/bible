"""获客渠道清洗单元测试。"""
from app.analytics.acquisition import normalize_channels, sanitize_slug


def test_sanitize_slug():
    assert sanitize_slug("WeChat Group!", max_len=64) == "wechat_group"
    assert sanitize_slug("wechat_group", max_len=64) == "wechat_group"
    assert sanitize_slug("campaign:abc-1", max_len=64) == "campaign:abc-1"


def test_normalize_channels_valid():
    l1, l2, l3 = normalize_channels(
        channel_l1="share", channel_l2="wechat_group", channel_l3="u:12345678"
    )
    assert l1 == "share"
    assert l2 == "wechat_group"
    assert l3 == "u:12345678"


def test_normalize_channels_invalid_l1():
    l1, l2, l3 = normalize_channels(channel_l1="foobar", channel_l2="x", channel_l3="")
    assert l1 == "unknown"
    assert l2 == "x"


def test_normalize_channels_organic_default_l2():
    l1, l2, l3 = normalize_channels(channel_l1="organic", channel_l2="", channel_l3="")
    assert l1 == "organic"
    assert l2 == "direct"
    assert l3 == ""
