"""section_stream / conversation_store 单测（P3）。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.conversation_store import (  # noqa: E402
    _history_tail_aligned,
    append_turns,
    find_resumable_conversation,
    history_for_prompt,
    merge_client_history,
    open_conversation,
)
from app.ai.section_stream import SectionStreamTracker, extract_section_bodies, iter_replay_stream  # noqa: E402


def test_section_tracker_delta_and_finalize():
    tracker = SectionStreamTracker(["摘要", "经文解释"])
    starts = tracker.bootstrap_starts()
    assert len(starts) == 2
    new_starts, deltas, corrections = tracker.on_delta("### 摘要\n神爱世人。\n\n")
    assert not corrections
    assert not new_starts or new_starts[0]["title"] == "摘要"
    assert deltas and deltas[0]["id"].startswith("sec-")
    assert "###" not in deltas[0]["text"]
    assert "神爱世人" in deltas[0]["text"]
    _, d2, _ = tracker.on_delta("### 经文解释\n- 要点一。\n")
    assert d2
    assert "###" not in d2[0]["text"]
    body = "### 摘要\n神爱世人。\n\n### 经文解释\n- 要点一。\n"
    done = tracker.finalize(body)
    assert len(done) == 2
    assert "要点一" in done[1]["text"]


def test_extract_section_bodies():
    body = "### 摘要\nA。\n\n### 背景\n- B。\n"
    chunks = extract_section_bodies(body)
    assert "sec-摘要" in chunks
    assert "B" in chunks["sec-背景"]


def test_section_tracker_preserves_prior_section_on_new_header():
    """P4：新小节开始时，已完成小节内容应保持稳定（服务端 tracker 契约）。"""
    tracker = SectionStreamTracker(["摘要", "经文解释"])
    tracker.bootstrap_starts()
    tracker.on_delta("### 摘要\n神爱世人。\n\n")
    tracker.on_delta("### 经文解释\n- 要点一。\n")
    body = "### 摘要\n神爱世人。\n\n### 经文解释\n- 要点一。\n"
    done = tracker.finalize(body)
    assert len(done) == 2
    assert done[0]["title"] == "摘要"
    assert "神爱世人" in done[0]["text"]
    assert "要点一" in done[1]["text"]


def test_history_tail_aligned_detects_mismatch():
    server = [
        {"role": "user", "content": "问题 A"},
        {"role": "assistant", "content": "回答 A"},
        {"role": "user", "content": "问题 B"},
        {"role": "assistant", "content": "回答 B"},
    ]
    client = [
        {"role": "user", "content": "问题 X"},
        {"role": "assistant", "content": "回答 X"},
    ]
    assert not _history_tail_aligned(server, client)


def test_section_tracker_correction_only_on_duplicate_headers():
    tracker = SectionStreamTracker(["摘要", "经文解释"])
    tracker.bootstrap_starts()
    tracker.on_delta("### 摘要\n神爱世人。\n\n")
    tracker.on_delta("### 经文解释\n- 要点一。\n")
    _, _, corrections = tracker.on_delta(
        "### 经文解释\n- 要点一。\n\n### 经文解释\n- 要点二。\n"
    )
    assert corrections
    assert all(c["id"] != "sec-摘要" or "神爱世人" in c["text"] for c in corrections)
    _, _, no_corr = tracker.on_delta("- 与要点一语义高度相近的重复句。\n")
    assert not no_corr


def test_iter_replay_stream_emits_sections_and_delta():
    answer = "### 摘要\n神爱世人。\n\n### 经文解释\n- 要点。\n"
    events = list(
        iter_replay_stream(answer, ["摘要", "经文解释"], chunk_size=24, emit_sections=True),
    )
    kinds = [e[0] for e in events]
    assert "section_start" in kinds
    assert "section_delta" in kinds
    assert "section_done" in kinds
    assert "delta" in kinds
    done = [p for k, p in events if k == "section_done"]
    assert len(done) == 2
    assert "要点" in done[1]["text"]


def test_find_resumable_conversation_memory():
    cid = open_conversation(
        None,
        guest_id="dev-a",
        user_id="user-1",
        ref="JHN.3.16",
        mode="explain",
        scene="verse_full",
    )
    append_turns(cid, user_content="请解释", assistant_content="### 摘要\n解释。")
    other = open_conversation(
        None,
        guest_id="dev-b",
        user_id="user-2",
        ref="JHN.3.16",
        mode="explain",
        scene="verse_full",
    )
    append_turns(other, user_content="别的用户", assistant_content="### 摘要\nB。")
    assert find_resumable_conversation(user_id="user-1", ref="JHN.3.16", mode="explain") == cid
    assert find_resumable_conversation(user_id="user-1", ref="ROM.8.1", mode="explain") is None
    assert find_resumable_conversation(user_id="user-2", ref="JHN.3.16", mode="explain") == other


def test_conversation_store_roundtrip():
    cid = open_conversation(
        None,
        guest_id="g1",
        user_id=None,
        ref="JHN.3.16",
        mode="explain",
        scene="verse_full",
    )
    append_turns(cid, user_content="请解释", assistant_content="### 摘要\n解释。")
    hist = history_for_prompt(cid)
    assert len(hist) == 2
    assert hist[0]["role"] == "user"
    merged = merge_client_history(hist, [{"role": "user", "content": "local"}])
    assert merged[0]["content"] == "local"
