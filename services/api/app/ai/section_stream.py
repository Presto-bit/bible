"""流式 section_* SSE 事件追踪（P3）。"""
from __future__ import annotations

import re
from typing import Iterator

from .answer_document import section_slug
from .parse_output import SECTION_MD_RE, merge_continuation_sections

_FOLLOWUP_TITLE = "相关追问"


def extract_section_bodies(body_text: str) -> dict[str, str]:
    """从归一化正文提取各小节 Markdown 片段。"""
    text = body_text.strip()
    if not text:
        return {}
    matches = list(SECTION_MD_RE.finditer(text))
    out: dict[str, str] = {}
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        if title == _FOLLOWUP_TITLE:
            break
        sid = section_slug(title)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end].strip()
        if chunk:
            out[sid] = chunk
    return out


class SectionStreamTracker:
    """将 Markdown delta 映射为 section_start / section_delta 事件。"""

    def __init__(self, planned_titles: list[str] | None = None) -> None:
        self._planned = [
            {"id": section_slug(t), "title": t}
            for t in (planned_titles or [])
            if t and t != _FOLLOWUP_TITLE
        ]
        self._started: set[str] = set()
        self._accum = ""
        self._section_emitted: dict[str, int] = {}

    def bootstrap_starts(self) -> list[dict]:
        """按 output_plan 预发 section_start（弱网可先挂骨架）。"""
        events: list[dict] = []
        for sec in self._planned:
            if sec["id"] in self._started:
                continue
            self._started.add(sec["id"])
            events.append({"id": sec["id"], "title": sec["title"]})
        return events

    def on_delta(self, piece: str) -> tuple[list[dict], list[dict], list[dict]]:
        """返回 (new_starts, section_deltas, section_corrections)。

        section_corrections：检测到重复小节合并时，用 section_done 整节替换客户端累积。
        """
        if not piece:
            return [], [], []
        self._accum += piece
        merged = merge_continuation_sections(self._accum)
        if merged != self._accum.strip() and (
            merged.count("### ") < self._accum.count("### ")
            or len(merged) < len(self._accum.strip()) - 12
        ):
            self._accum = merged
            bodies = extract_section_bodies(self._accum)
            self._section_emitted = {sid: len(body) for sid, body in bodies.items()}
            corrections = [
                {
                    "id": sid,
                    "title": self._title_for_id(sid, self._accum),
                    "text": body,
                }
                for sid, body in bodies.items()
            ]
            return [], [], corrections
        new_starts: list[dict] = []
        for m in SECTION_MD_RE.finditer(self._accum):
            title = m.group(1).strip()
            if title == _FOLLOWUP_TITLE:
                break
            sid = section_slug(title)
            if sid in self._started:
                continue
            self._started.add(sid)
            new_starts.append({"id": sid, "title": title})
        deltas: list[dict] = []
        matches = [
            m
            for m in SECTION_MD_RE.finditer(self._accum)
            if m.group(1).strip() != _FOLLOWUP_TITLE
        ]
        if not matches and self._planned:
            sid = self._planned[0]["id"]
            prev = self._section_emitted.get(sid, 0)
            raw = self._accum
            if len(raw) > prev:
                deltas.append({"id": sid, "text": raw[prev:]})
                self._section_emitted[sid] = len(raw)
        elif not matches and not self._planned and self._accum.strip():
            body_id = section_slug("正文")
            if body_id not in self._started:
                self._started.add(body_id)
                new_starts.append({"id": body_id, "title": "正文"})
            prev = self._section_emitted.get(body_id, 0)
            if len(self._accum) > prev:
                deltas.append({"id": body_id, "text": self._accum[prev:]})
                self._section_emitted[body_id] = len(self._accum)
        else:
            for sid, full_text in extract_section_bodies(self._accum).items():
                prev = self._section_emitted.get(sid, 0)
                if len(full_text) > prev:
                    deltas.append({"id": sid, "text": full_text[prev:]})
                    self._section_emitted[sid] = len(full_text)
        return new_starts, deltas, []

    def finalize(self, body_text: str) -> list[dict]:
        """终稿 section_done（id/title/text）。"""
        bodies = extract_section_bodies(body_text)
        done: list[dict] = []
        for sid, text in bodies.items():
            title = self._title_for_id(sid, body_text)
            done.append({"id": sid, "title": title, "text": text})
        return done

    def _title_for_id(self, sid: str, body_text: str) -> str:
        for m in SECTION_MD_RE.finditer(body_text):
            title = m.group(1).strip()
            if title == _FOLLOWUP_TITLE:
                break
            if section_slug(title) == sid:
                return title
        for sec in self._planned:
            if sec["id"] == sid:
                return sec["title"]
        return sid

    def _current_section_id(self) -> str | None:
        matches = [
            m
            for m in SECTION_MD_RE.finditer(self._accum)
            if m.group(1).strip() != _FOLLOWUP_TITLE
        ]
        if not matches:
            if self._planned:
                return self._planned[0]["id"]
            return None
        return section_slug(matches[-1].group(1).strip())


def iter_replay_stream(
    answer: str,
    planned_titles: list[str] | None = None,
    *,
    chunk_size: int = 48,
    emit_delta: bool = True,
    emit_sections: bool = True,
) -> Iterator[tuple[str, dict]]:
    """缓存命中 / 秒回：按 live 流同样顺序重放 delta 与 section_*。"""
    if not answer.strip():
        return
    tracker = SectionStreamTracker(planned_titles)
    if emit_sections:
        for start in tracker.bootstrap_starts():
            yield "section_start", start
    for i in range(0, len(answer), chunk_size):
        piece = answer[i : i + chunk_size]
        if emit_delta:
            yield "delta", {"text": piece}
        if not emit_sections:
            continue
        starts, deltas, corrections = tracker.on_delta(piece)
        for start in starts:
            yield "section_start", start
        for delta in deltas:
            yield "section_delta", delta
        for corr in corrections:
            yield "section_done", corr
    if emit_sections:
        for item in tracker.finalize(answer):
            yield "section_done", item
