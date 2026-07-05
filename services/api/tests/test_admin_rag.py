"""管理员鉴权与 RAG 管理 API 测试。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

from app.admin.auth import make_admin_token, verify_admin_credentials, verify_admin_token  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def test_verify_admin_credentials():
    s = get_settings()
    assert verify_admin_credentials(s.admin_phone, s.admin_password)
    assert not verify_admin_credentials(s.admin_phone, "wrong")


def test_admin_token_roundtrip():
    s = get_settings()
    token = make_admin_token(s.admin_phone)
    assert verify_admin_token(token) == s.admin_phone.replace(" ", "").replace("-", "")
    assert verify_admin_token("bad-token") is None


def test_admin_login_and_me():
    s = get_settings()
    res = client.post("/admin/auth/login", json={"phone": s.admin_phone, "password": s.admin_password})
    assert res.status_code == 200
    token = res.json()["token"]
    me = client.get("/admin/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["is_admin"] is True


def test_admin_rag_status_requires_auth():
    res = client.get("/admin/rag/status")
    assert res.status_code == 401


def test_admin_rag_inventory_requires_auth():
    res = client.get("/admin/rag/inventory")
    assert res.status_code == 401


def test_admin_rag_inventory_with_token():
    s = get_settings()
    res = client.post("/admin/auth/login", json={"phone": s.admin_phone, "password": s.admin_password})
    token = res.json()["token"]
    inv = client.get("/admin/rag/inventory", headers={"Authorization": f"Bearer {token}"})
    assert inv.status_code == 200
    body = inv.json()
    assert "summary" in body
    assert "collections" in body
    assert "indexed" in body["summary"]
    assert isinstance(body["collections"], list)


def test_admin_eligible_requires_user():
    res = client.get("/admin/auth/eligible")
    assert res.status_code == 401


def test_admin_eligible_with_user_header():
    res = client.get("/admin/auth/eligible", headers={"X-User-Code": "1234567890"})
    assert res.status_code == 200
    data = res.json()
    assert "admin_eligible" in data
    assert isinstance(data["admin_eligible"], bool)


def test_admin_stats_requires_auth():
    res = client.get("/admin/stats")
    assert res.status_code == 401


def test_admin_stats_with_token():
    s = get_settings()
    res = client.post("/admin/auth/login", json={"phone": s.admin_phone, "password": s.admin_password})
    token = res.json()["token"]
    stats = client.get("/admin/stats", headers={"Authorization": f"Bearer {token}"})
    assert stats.status_code == 200
    body = stats.json()
    assert "totals" in body
    assert "series" in body
    assert "users" in body["totals"]
    assert "ai_requests" in body["series"]
