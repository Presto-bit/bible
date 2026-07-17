"""小爱编排单测（不依赖 LLM 网络；注释检索 PG 不可用时走降级分支）。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.prompts import DEFAULT_MODE, MODES, build_messages  # noqa: E402
from app.ai.scenes import SCENES  # noqa: E402
from app.ai.usage import consume_quota, record_ai_request  # noqa: E402
from app.config import get_settings  # noqa: E402

_HAS_DB = Path(get_settings().bible_db_path).exists()


def test_modes_present():
    assert set(MODES) == {
        "understand",
        "explain",
        "apply",
        "compare",
        "original",
        "preach",
    }


def test_build_messages_structure_and_citations():
    msgs = build_messages(
        scene=SCENES["chat_explain"],
        passage_display="约翰福音 3:16",
        passage_text="神爱世人……",
        question="这里的爱是什么意思？",
        citations=[
            {"n": 1, "title": "0041-约翰福音", "snippet": "三16~18 由希腊文动词时态…"},
        ],
    )
    assert len(msgs) == 2 and msgs[0]["role"] == "system" and msgs[1]["role"] == "user"
    assert "释经" in msgs[0]["content"]
    assert "禁用空泛套话" in msgs[0]["content"]
    assert "相关追问" in msgs[0]["content"]
    assert "Markdown" in msgs[0]["content"]
    assert "[1]" in msgs[1]["content"]
    assert "约翰福音 3:16" in msgs[1]["content"]
    assert "这里的爱是什么意思？" in msgs[1]["content"]


def test_build_messages_reader_context_and_continuity():
    from app.ai.prompts import format_reader_context

    ctx = format_reader_context(
        {
            "last_read_label": "约翰福音 6:4",
            "reading_streak": 7,
            "recent_note_snippets": ["恩典够用"],
        }
    )
    assert "约翰福音 6:4" in ctx
    msgs = build_messages(
        scene=SCENES["chat_explain"],
        passage_display="约翰福音 3:16",
        passage_text="",
        question="继续",
        citations=[],
        reader_context={
            "last_read_label": "约翰福音 6:4",
            "reading_streak": 7,
        },
        has_prior_turns=True,
    )
    assert "【读者上下文】" in msgs[1]["content"]
    assert "连续读经" in msgs[1]["content"]
    assert "上文已有" in msgs[0]["content"] or "接续前文" in msgs[0]["content"]


def test_build_messages_scene_without_followups():
    msgs = build_messages(
        scene=SCENES["verse_quick"],
        passage_display="诗篇 23",
        passage_text="",
        question=None,
        citations=[],
    )
    assert "列出 2–3 个简短的后续问题" not in msgs[0]["content"]
    assert "主动" in msgs[1]["content"]
    assert "暂无可用背景注释" in msgs[1]["content"]


def test_build_messages_general_no_ref():
    msgs = build_messages(
        scene=SCENES["chat_general"],
        passage_display="（未指定经文）",
        passage_text="",
        question="介绍摩西生平",
        citations=[],
    )
    assert "主题问答" in msgs[0]["content"] or "未绑定具体经文" in msgs[0]["content"]
    assert "### 相关经节" in msgs[0]["content"] or "相关经节" in msgs[0]["content"]
    assert "【经文要旨】" not in msgs[0]["content"]
    assert "经文：" not in msgs[1]["content"]
    assert "介绍摩西生平" in msgs[1]["content"]


def test_resolve_scene_without_ref():
    from app.ai.scenes import resolve_scene

    assert resolve_scene("chat_understand", "understand", has_ref=False).id == "chat_general"
    assert resolve_scene(None, "understand", has_ref=False).id == "chat_general"
    assert resolve_scene("summary_book", "explain", has_ref=False).id == "summary_book"


@pytest.mark.skipif(not _HAS_DB, reason="缺少经文库")
def test_prepare_general_question():
    from app.ai.chat import prepare

    prep = prepare(
        ref_raw=None,
        question="介绍摩西生平",
        mode="understand",
        scene="chat_understand",
    )
    assert prep["meta"]["scene"] == "chat_general"
    assert prep["meta"]["ref"] is None
    user_msg = prep["messages"][-1]["content"]
    assert "介绍摩西生平" in user_msg
    assert "经文：" not in user_msg


def test_build_messages_unknown_mode_falls_back():
    msgs = build_messages(
        scene=SCENES["chat_explain"],
        passage_display="诗篇 23",
        passage_text="",
        question=None,
        citations=[],
    )
    assert MODES[DEFAULT_MODE][:2] in msgs[0]["content"] or "理解" in msgs[0]["content"]
    assert "主动" in msgs[1]["content"]


def test_consume_quota_no_device_denied():
    allowed, used, limit = consume_quota(None, 10)
    assert allowed is False and limit == 10 and used == 10


def test_record_ai_request_no_device_is_noop():
    record_ai_request(None, "00000000-0000-0000-0000-000000000001")


def test_sanitize_history_filters_and_caps():
    from app.ai.chat import MAX_HISTORY_TURNS, _sanitize_history

    raw = [
        {"role": "user", "content": "问题一"},
        {"role": "assistant", "content": "回答一"},
        {"role": "system", "content": "应被过滤"},
        {"role": "user", "content": ""},
        {"role": "bad", "content": "x"},
    ]
    out = _sanitize_history(raw)
    assert out == [
        {"role": "user", "content": "问题一"},
        {"role": "assistant", "content": "回答一"},
    ]
    big = [{"role": "user", "content": str(i)} for i in range(50)]
    assert len(_sanitize_history(big)) == MAX_HISTORY_TURNS


def test_build_messages_no_rag_omits_commentary():
    msgs = build_messages(
        scene=SCENES["summary_chapter"],
        passage_display="出埃及记 3",
        passage_text="摩西在荆棘火焰中……",
        question="请概括本章。",
        citations=[],
        use_rag=False,
    )
    assert "【背景注释】" not in msgs[1]["content"]
    assert "证据规则" not in msgs[0]["content"]
    assert SCENES["summary_chapter"].use_rag is False
    assert SCENES["verse_full"].use_rag is True


@pytest.mark.skipif(not _HAS_DB, reason="缺少经文库")
def test_prepare_summary_skips_rag():
    from app.ai.chat import prepare

    prep = prepare(
        ref_raw="EXO.3",
        question="请概括本章。",
        mode="explain",
        scene="summary_chapter",
    )
    assert prep["meta"]["citations"] == []
    assert "【背景注释】" not in prep["messages"][-1]["content"]


@pytest.mark.skipif(not _HAS_DB, reason="缺少经文库")
def test_prepare_home_prefill_skips_rag():
    from app.ai.chat import prepare

    prep = prepare(
        ref_raw="JHN.3.16",
        question="这段经文对你意味着什么？",
        mode="explain",
        scene="chat_explain",
        surface="home_prefill",
    )
    assert prep["meta"]["use_rag"] is False
    assert prep["meta"]["citations"] == []
    assert "【背景注释】" not in prep["messages"][-1]["content"]


@pytest.mark.skipif(not _HAS_DB, reason="缺少经文库")
def test_prepare_inserts_history_between_system_and_user():
    from app.ai.chat import prepare

    prep = prepare(
        ref_raw="JHN.3.16",
        question="那「永生」呢？",
        mode="understand",
        scene="chat_understand",
        history=[
            {"role": "user", "content": "这里的爱是什么意思？"},
            {"role": "assistant", "content": "是神主动舍己的爱……"},
        ],
    )
    msgs = prep["messages"]
    assert msgs[0]["role"] == "system"
    assert msgs[1]["content"] == "这里的爱是什么意思？"
    assert msgs[2]["role"] == "assistant"
    assert msgs[-1]["role"] == "user" and "永生" in msgs[-1]["content"]
    assert prep["meta"]["scene"] == "chat_understand"
    assert prep["meta"]["has_commentary"] is False


@pytest.mark.skipif(not _HAS_DB, reason="缺少经文库")
def test_prepare_with_reader_context():
    from app.ai.chat import prepare

    prep = prepare(
        ref_raw="JHN.3.16",
        question="这节怎么读？",
        mode="explain",
        scene="chat_explain",
        reader_context={"last_read_label": "约翰福音 6:4", "reading_streak": 3},
    )
    user_msg = prep["messages"][-1]["content"]
    assert "【读者上下文】" in user_msg
    assert "约翰福音 6:4" in user_msg
    assert prep["meta"]["has_commentary"] in (True, False)


@pytest.mark.skipif(not _HAS_DB, reason="缺少经文库")
def test_prepare_degrades_without_pg():
    """PG 不可用时仍能取经文文本、降级为空脚注。"""
    from app.ai.chat import prepare

    prep = prepare(ref_raw="JHN.3.16", question=None, mode="understand")
    assert prep["meta"]["ref"] == "JHN.3.16"
    assert prep["meta"]["display"] == "约翰福音 3:16"
    assert isinstance(prep["meta"]["citations"], list)
    user_msg = prep["messages"][-1]["content"]
    assert "约翰福音 3:16" in user_msg
