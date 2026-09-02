from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.bible import audio
from app.main import app

client = TestClient(app)


def test_audio_manifest_cuvs():
    r = client.get("/bible/audio/manifest?version=cuvs")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == "cuvs"
    assert body["granularity"] == "chapter"
    assert "JHN" in body["books"]
    assert body["books"]["JHN"]["chapter_count"] == 21


def test_audio_chapter_jhn3():
    r = client.get("/bible/audio/chapter?book=JHN&chapter=3&version=cnv")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["audio_version"] == "cuvs"
    assert body["audio_label"] == "FCBH 专业朗读"
    assert body["stream_path"] == "/bible/audio/stream/cuvs/JHN/3"
    assert body["fallback_stream_url"] == "https://media.fhl.net/springunv/43/43_003.mp3"


def test_audio_chapter_kjv_unavailable():
    r = client.get("/bible/audio/chapter?book=JHN&chapter=3&version=kjv")
    assert r.status_code == 200
    assert r.json()["available"] is False


def test_audio_stream_uses_cache(tmp_path, monkeypatch):
    dest = tmp_path / "cuvs" / "JHN" / "3.mp3"
    dest.parent.mkdir(parents=True)
    dest.write_bytes(b"ID3" + b"\x00" * (32 * 1024))

    monkeypatch.setattr(audio, "_storage_root", lambda: tmp_path)
    audio._manifest_for.cache_clear()

    r = client.get("/bible/audio/stream/cuvs/JHN/3")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("audio/")
    assert r.content[:3] == b"ID3"


def test_fhl_direct_mp3_url():
    assert audio._fhl_direct_mp3_url(43, 3, book_id="JHN") == (
        "https://media.fhl.net/springunv/43/43_003.mp3"
    )
    assert audio._fhl_direct_mp3_url(1, 1, book_id="GEN") == (
        "https://media.fhl.net/unv1/1/1_001.mp3"
    )
    assert audio._fhl_mp3_candidates("JHN", 43, 3) == [
        "https://media.fhl.net/springunv/43/43_003.mp3",
        "https://media.fhl.net/unv1/43/43_003.mp3",
    ]


def test_ensure_cached_offline_raises(tmp_path, monkeypatch):
    class FakeSettings:
        bible_audio_offline = True

    monkeypatch.setattr(audio, "_storage_root", lambda: tmp_path)
    monkeypatch.setattr(audio, "get_settings", lambda: FakeSettings())
    audio._manifest_for.cache_clear()
    with pytest.raises(HTTPException) as ei:
        audio.ensure_cached("cuvs", "GEN", 1)
    assert ei.value.status_code == 404


def test_audio_timestamps_without_key(monkeypatch):
    monkeypatch.setattr(audio, "_bb_key", lambda: "")
    audio._bb_audio_fileset.cache_clear()
    r = client.get("/bible/audio/timestamps/cuvs/JHN/3")
    assert r.status_code == 200
    body = r.json()
    assert body["has_timestamps"] is False
    assert body["verses"] == []
