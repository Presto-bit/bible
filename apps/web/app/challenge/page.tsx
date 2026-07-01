'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  challengeSummary,
  clearPendingBookChallenge,
  getPendingBookChallenge,
  levelProgress,
  levelsIncludingPending,
  markLevelProgress,
} from '@/lib/challenge_progress';
import type { ChallengeLevel, ChallengeQuestion } from '@/lib/challenge_levels';

export default function ChallengePage() {
  const levels = useMemo(() => levelsIncludingPending(), []);
  const summary = useMemo(() => challengeSummary(levels), [levels]);
  const [activeLevel, setActiveLevel] = useState<ChallengeLevel | null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [prog, setProg] = useState(levelProgress());
  const pending = getPendingBookChallenge();

  useEffect(() => setProg(levelProgress()), []);

  const play = activeLevel;
  const q: ChallengeQuestion | null = play ? play.questions[qIdx] : null;

  const finishLevel = (correct: number) => {
    if (!play) return;
    markLevelProgress(play.id, correct, play.questions.length);
    setProg(levelProgress());
    if (play.bookId) clearPendingBookChallenge();
    setActiveLevel(null);
    setQIdx(0);
    setPicked(null);
    setCorrectCount(0);
  };

  const pick = (i: number) => {
    if (!q || picked != null) return;
    setPicked(i);
    const ok = i === q.answer;
    const nextCorrect = correctCount + (ok ? 1 : 0);
    if (qIdx + 1 >= (play?.questions.length ?? 0)) {
      setTimeout(() => finishLevel(nextCorrect), 700);
    } else {
      setTimeout(() => {
        setCorrectCount(nextCorrect);
        setQIdx((x) => x + 1);
        setPicked(null);
      }, 700);
    }
  };

  if (play && q) {
    return (
      <main className="container challenge-play">
        <header className="challenge-play-head">
          <button type="button" className="text-link" onClick={() => setActiveLevel(null)}>← 关卡</button>
          <span className="muted">{play.title} · {qIdx + 1}/{play.questions.length}</span>
        </header>
        <div className="challenge-progress-bar">
          <div style={{ width: `${((qIdx + (picked != null ? 1 : 0)) / play.questions.length) * 100}%` }} />
        </div>
        <div className="card challenge-q-card">
          <span className="pill">{play.subtitle}</span>
          <p className="quiz-q">{q.question}</p>
          <div className="quiz-options">
            {q.options.map((o, i) => {
              const show = picked != null;
              const isAns = i === q.answer;
              const isPick = i === picked;
              return (
                <button
                  key={i}
                  type="button"
                  className={`quiz-opt ${show && isAns ? 'quiz-opt-correct' : ''} ${show && isPick && !isAns ? 'quiz-opt-wrong' : ''}`}
                  onClick={() => pick(i)}
                  disabled={picked != null}
                >
                  {o}
                </button>
              );
            })}
          </div>
          {picked != null && (
            <p style={{ marginTop: 14, lineHeight: 1.7, fontSize: 14 }}>{q.explain}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Link href="/" className="icon-btn">←</Link>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>圣经知识闯关</h2>
      </header>

      <div className="challenge-hero card">
        <div className="challenge-hero-ring">
          <span>{summary.progressPct}%</span>
        </div>
        <div>
          <strong>已通关 {summary.completedLevels} / {summary.totalLevels} 关</strong>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            答对 {summary.correctQ} / {summary.totalQ} 题
          </p>
        </div>
      </div>

      {pending && (
        <div className="challenge-nudge card">
          <span className="pill pill-active">读完 {pending.bookName}</span>
          <p style={{ margin: '8px 0 0', fontSize: 14 }}>来一关巩固挑战，检验一下掌握程度？</p>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 10 }}
            onClick={() => {
              const lv = levels.find((l) => l.id === pending.levelId);
              if (lv) setActiveLevel(lv);
            }}
          >
            开始巩固关 ›
          </button>
        </div>
      )}

      <div className="challenge-level-grid">
        {levels.map((lv, i) => {
          const p = prog[lv.id];
          const locked = i > 0 && !prog[levels[i - 1].id]?.done && !lv.bookId;
          const done = p?.done;
          return (
            <button
              key={lv.id}
              type="button"
              className={`challenge-level-card ${done ? 'challenge-level-done' : ''} ${locked ? 'challenge-level-locked' : ''}`}
              disabled={locked}
              onClick={() => !locked && setActiveLevel(lv)}
            >
              <span className="challenge-level-icon">{done ? '✓' : lv.icon}</span>
              <strong>{lv.title}</strong>
              <span className="muted" style={{ fontSize: 11 }}>{lv.subtitle}</span>
              <span className="challenge-level-meta">{lv.questions.length} 题</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
