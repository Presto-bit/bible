from app.ai.passage_context import passage_context_brief
from app.bible.refs import parse_ref


def test_passage_context_jhn3():
    ref = parse_ref("JHN 3:16")
    assert ref is not None
    brief = passage_context_brief(ref, max_chars=400)
    assert "书卷取向" in brief
    assert "约翰" in brief or "生命" in brief


def test_passage_context_empty_without_chapter():
    ref = parse_ref("JHN")
    assert ref is not None
    assert passage_context_brief(ref) == ""
