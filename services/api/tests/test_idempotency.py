"""POST /ai/chat 幂等键单测。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.idempotency import claim_idempotency  # noqa: E402


def test_claim_idempotency_allows_first_use():
    assert claim_idempotency("k-a", guest_id="guest-1") is True


def test_claim_idempotency_rejects_duplicate_same_guest():
    key = "k-dup"
    assert claim_idempotency(key, guest_id="guest-2") is True
    assert claim_idempotency(key, guest_id="guest-2") is False


def test_claim_idempotency_scoped_by_guest():
    key = "k-scope"
    assert claim_idempotency(key, guest_id="guest-a") is True
    assert claim_idempotency(key, guest_id="guest-b") is True


def test_claim_idempotency_empty_key_always_allowed():
    assert claim_idempotency(None, guest_id="guest-1") is True
    assert claim_idempotency("", guest_id="guest-1") is True
    assert claim_idempotency("  ", guest_id="guest-1") is True
