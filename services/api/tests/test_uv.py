"""UV 统计单元测试。"""
from app.analytics.uv import (
    legacy_visitor_key,
    resolve_device_fingerprint,
    should_record_uv,
    visitor_key,
)


def test_visitor_key_prefers_user():
    assert visitor_key(user_id="uuid-1", device_id="dev-1") == "u:uuid-1"


def test_visitor_key_device_fallback():
    assert visitor_key(user_id=None, device_id="  abc  ") == "d:abc"


def test_visitor_key_empty():
    assert visitor_key(user_id=None, device_id=None) is None
    assert visitor_key(user_id=None, device_id="   ") is None


def test_resolve_device_fingerprint_prefers_device():
    assert resolve_device_fingerprint(user_id="u1", device_id="dev-1") == "dev-1"


def test_resolve_device_fingerprint_user_only():
    assert resolve_device_fingerprint(user_id="u1", device_id=None) == "uid:u1"


def test_legacy_visitor_key_matches_visitor_key():
    assert legacy_visitor_key(user_id="u1", device_id="d1") == visitor_key(
        user_id="u1", device_id="d1"
    )


def test_should_record_uv_skips_admin_and_health():
    assert should_record_uv("/health", "GET") is False
    assert should_record_uv("/admin/stats", "GET") is False
    assert should_record_uv("/content/daily-verse", "GET") is True
    assert should_record_uv("/bible/books", "OPTIONS") is False
