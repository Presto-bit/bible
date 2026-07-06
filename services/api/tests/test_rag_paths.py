"""RAG 路径匹配与索引 lookup 测试。"""
from __future__ import annotations

import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

from app.admin.rag_inventory import _index_documents, _inventory_status, _match_document  # noqa: E402
from app.rag.paths import normalize_source_path, path_match_keys  # noqa: E402


def test_normalize_source_path_relative():
    p = normalize_source_path("content/commentary/study-bible/core-passages.md")
    assert p.endswith("core-passages.md")
    assert Path(p).is_absolute() or "content" in p


def test_path_match_keys_includes_name_and_relative():
    keys = path_match_keys("/app/content/commentary/public-domain/gen-1.md")
    assert "gen-1.md" in keys
    assert any("public-domain" in k for k in keys)


def test_match_document_by_filename_unique():
    docs = [{
        "id": "1",
        "title": "Genesis 1",
        "source_type": "commentary",
        "status": "ready",
        "source_path": "/app/content/commentary/public-domain/gen-1.md",
        "chunks": 12,
        "rag_index_error": None,
    }]
    by_key, by_name = _index_documents(docs)
    hit = _match_document(
        Path("/app/content/commentary/public-domain/gen-1.md"),
        by_key=by_key,
        by_name=by_name,
    )
    assert hit is not None
    assert hit["id"] == "1"
    assert _inventory_status(hit, file_exists=True) == "indexed"


def test_match_document_pending_when_no_db_row():
    by_key, by_name = _index_documents([])
    hit = _match_document(
        Path("/app/content/commentary/public-domain/new-file.md"),
        by_key=by_key,
        by_name=by_name,
    )
    assert hit is None
    assert _inventory_status(hit, file_exists=True) == "pending"


def test_no_loose_suffix_false_match():
    docs = [
        {
            "id": "old",
            "title": "Old orphan",
            "source_type": "commentary",
            "status": "ready",
            "source_path": "/old/volume/matthew-henry-gen.md",
            "chunks": 0,
            "rag_index_error": None,
        },
        {
            "id": "new",
            "title": "New indexed",
            "source_type": "commentary",
            "status": "ready",
            "source_path": "/app/content/commentary/public-domain/matthew-henry-gen.md",
            "chunks": 40,
            "rag_index_error": None,
        },
    ]
    by_key, by_name = _index_documents(docs)
    # 两个同名文件时不应盲目匹配
    hit = _match_document(
        Path("/app/content/commentary/public-domain/matthew-henry-gen.md"),
        by_key=by_key,
        by_name=by_name,
    )
    assert hit is not None
    assert hit["id"] == "new"
