"""UV 统计单元测试。"""
from app.analytics.uv import (
    legacy_visitor_key,
    resolve_device_fingerprint,
    should_record_uv,
    uv_identity_sql,
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


def test_resolve_device_fingerprint_ip_device():
    assert resolve_device_fingerprint(user_id=None, device_id="ip:1.2.3.4") == "ip:1.2.3.4"


def test_legacy_visitor_key_matches_visitor_key():
    assert legacy_visitor_key(user_id="u1", device_id="d1") == visitor_key(
        user_id="u1", device_id="d1"
    )


def test_should_record_uv_skips_admin_and_health():
    assert should_record_uv("/health", "GET") is False
    assert should_record_uv("/admin/stats", "GET") is False
    assert should_record_uv("/content/daily-verse", "GET") is True
    assert should_record_uv("/bible/books", "GET") is True
    assert should_record_uv("/bible/books", "OPTIONS") is False


def test_uv_identity_prefers_user_code():
    sql = uv_identity_sql()
    assert "accounts" in sql
    assert "user_code" in sql
    assert "device_user_bindings" in sql
    assert "pwd_hash" in sql
    assert "nullif(trim(" in sql
    aliased = uv_identity_sql("d")
    assert "d.user_id" in aliased
    assert "d.device_fingerprint" in aliased
    assert "d.user_code" in aliased
    assert "visitor_key" in aliased


def test_uv_attributed_requires_secured_account():
    from app.analytics.uv_stats import uv_attributed_where

    sql = uv_attributed_where()
    assert "pwd_hash" in sql
    assert "phone" in sql
    assert "device_user_bindings" in sql
    aliased = uv_attributed_where("d")
    assert "d.user_id" in aliased
    assert "d.device_fingerprint" in aliased
    assert "d.user_code" in aliased
