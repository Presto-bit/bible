"""平台知识库不含产品摘要/词典。"""
from app.ai.knowledge_bases import (
    PLATFORM_SOURCE_TYPES,
    PRODUCT_CONTENT_SOURCE_TYPES,
    TOPIC_FOLDERS,
    source_types_for_kb,
)


def test_product_content_types_excluded_from_platform():
    assert "study-bible-zh" in PRODUCT_CONTENT_SOURCE_TYPES
    assert "reference-en" in PRODUCT_CONTENT_SOURCE_TYPES
    for st in PRODUCT_CONTENT_SOURCE_TYPES:
        assert st not in PLATFORM_SOURCE_TYPES


def test_platform_kb_source_types():
    types = source_types_for_kb("platform")
    assert "commentary" in types
    assert "study-bible-zh" not in types
    assert "reference-en" not in types


def test_topic_folders_have_no_product_dictionary():
    for folder in TOPIC_FOLDERS:
        for st in folder["source_types"]:
            assert st not in PRODUCT_CONTENT_SOURCE_TYPES
