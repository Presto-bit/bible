"""发版冒烟 dry-run：内网鉴权探测不写 daily_verse_like。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.content.router import _allow_smoke_dry_run, _is_internal_client_host  # noqa: E402


class _FakeClient:
    def __init__(self, host: str) -> None:
        self.host = host


class _FakeRequest:
    def __init__(self, host: str) -> None:
        self.client = _FakeClient(host)


def test_internal_client_hosts():
    assert _is_internal_client_host("127.0.0.1")
    assert _is_internal_client_host("::1")
    assert _is_internal_client_host("testclient")
    assert _is_internal_client_host("172.18.0.1")
    assert _is_internal_client_host("10.0.0.5")
    assert not _is_internal_client_host("8.8.8.8")


def test_allow_smoke_dry_run_requires_header_and_internal():
    internal = _FakeRequest("172.18.0.1")
    assert _allow_smoke_dry_run(internal, "dry-run")
    assert not _allow_smoke_dry_run(internal, "other")
    assert not _allow_smoke_dry_run(_FakeRequest("203.0.113.1"), "dry-run")
