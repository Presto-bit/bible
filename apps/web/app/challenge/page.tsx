'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import ChallengeFlipPlay from '@/components/ChallengeFlipPlay';
import {
  challengeSummary,
  clearPendingBookChallenge,
  getPendingBookChallenge,
  levelProgress,
  levelsIncludingPending,
  markLevelProgress,
} from '@/lib/challenge_progress';
import type { ChallengeLevel } from '@/lib/challenge_levels';
import {
  dailyQuizDone,
  dailyQuizQuestions,
  markDailyQuizDone,
  recordAnswer,
} from '@/lib/daily_quiz';
import {
  QUESTION_BANK_SIZE,
  QUESTION_THEMES,
  randomQuestions,
  themeLevelQuestions,
  type QuestionBankEntry,
} from '@/lib/question_bank';

type PlayMode =
  | { kind: 'daily' }
  | { kind: 'random' }
  | { kind: 'theme'; themeId: string; title: string }
  | { kind: 'level'; level: ChallengeLevel };

export default function ChallengePage() {
  const levels = useMemo(() => levelsIncludingPending(), []);
  const summary = useMemo(() => challengeSummary(levels), [levels]);
  const [play, setPlay] = useState<PlayMode | null>(null);
  const [prog, setProg] = useState(levelProgress());
  const [dailyDone, setDailyDone] = useState(false);
  const pending = getPendingBookChallenge();

  useEffect(() => {
    setDailyDone(dailyQuizDone());
  }, [play]);

  const playQuestions: QuestionBankEntry[] | null = useMemo(() => {
    if (!play) return null;
    if (play.kind === 'daily') return dailyQuizQuestions(5);
    if (play.kind === 'random') return randomQuestions(10);
    if (play.kind === 'theme') return themeLevelQuestions(play.themeId, 8);
    return play.level.questions as QuestionBankEntry[];
  }, [play]);

  const finishPlay = (correct: number, total: number) => {
    if (play?.kind === 'level') {
      markLevelProgress(play.level.id, correct, total);
      if (play.level.bookId) clearPendingBookChallenge();
    }
    if (play?.kind === 'daily') {
      markDailyQuizDone();
    }
    if (playQuestions) {
      playQuestions.forEach((q, i) => {
        const pickedCorrect = i < correct; // approximate per-session; flip play tracks sequentially
        void q;
      });
    }
    setProg(levelProgress());
    setPlay(null);
  };

  if (play && playQuestions) {
    const title =
      play.kind === 'daily'
        ? '每日问答'
        : play.kind === 'random'
          ? '随机挑战'
          : play.kind === 'theme'
            ? play.title
            : play.level.title;
    const sub =
      play.kind === 'daily'
        ? '今日 5 题'
        : play.kind === 'random'
          ? '全库随机'
          : play.kind === 'theme'
            ? '主题闯关'
            : play.level.subtitle;

    return (
      <ChallengeFlipPlay
        title={title}
        subtitle={sub}
        questions={playQuestions}
        onBack={() => setPlay(null)}
        onFinish={finishPlay}
        onEachAnswer={(id, correct) => recordAnswer(id, correct)}
      />
    );
  }

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Link href="/" className="icon-btn">←</Link>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>每日问答</h2>
      </header>

      <button
        type="button"
        className="challenge-daily-hero card"
        onClick={() => setPlay({ kind: 'daily' })}
      >
        <div className="challenge-daily-badge">{dailyDone ? '✓' : '☀'}</div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <strong>每日问答</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {dailyDone ? '今日已完成 · 明天再来' : '5 道随机题 · 优先复习错题'}
          </p>
        </div>
        <span className="rail-cta">{dailyDone ? '复习 ›' : '开始 ›'}</span>
      </button>

      <div className="challenge-mode-row">
        <button
          type="button"
          className="card challenge-mode-card"
          onClick={() => setPlay({ kind: 'random' })}
        >
          <span className="challenge-level-icon">🎲</span>
          <strong>随机挑战</strong>
          <span className="muted" style={{ fontSize: 11 }}>从 {QUESTION_BANK_SIZE} 题中抽 10 题</span>
        </button>
        <div className="challenge-hero card" style={{ flex: 1 }}>
          <div className="challenge-hero-ring">
            <span>{summary.progressPct}%</span>
          </div>
          <div>
            <strong>关卡 {summary.completedLevels}/{summary.totalLevels}</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              答对 {summary.correctQ} 题
            </p>
          </div>
        </div>
      </div>

      {pending && (
        <div className="challenge-nudge card">
          <span className="pill pill-active">读完 {pending.bookName}</span>
          <p style={{ margin: '8px 0 0', fontSize: 14 }}>来一关巩固挑战？</p>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 10 }}
            onClick={() => {
              const lv = levels.find((l) => l.id === pending.levelId);
              if (lv) setPlay({ kind: 'level', level: lv });
            }}
          >
            开始巩固关 ›
          </button>
        </div>
      )}

      <p className="section-label">按主题闯关</p>
      <div className="challenge-level-grid">
        {QUESTION_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="challenge-level-card"
            onClick={() => setPlay({ kind: 'theme', themeId: t.id, title: t.name })}
          >
            <span className="challenge-level-icon">📚</span>
            <strong>{t.name}</strong>
            <span className="challenge-level-meta">8 题</span>
          </button>
        ))}
      </div>

      <p className="section-label">经典关卡</p>
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
              onClick={() => !locked && setPlay({ kind: 'level', level: lv })}
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
