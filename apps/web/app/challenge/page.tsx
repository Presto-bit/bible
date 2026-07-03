'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import ChallengeFlipPlay from '@/components/ChallengeFlipPlay';
import {
  clearPendingBookChallenge,
  getPendingBookChallenge,
  levelProgress,
  levelsIncludingPending,
  markLevelProgress,
} from '@/lib/challenge_progress';
import type { ChallengeLevel } from '@/lib/challenge_levels';
import {
  answerStats,
  dailyQuizDone,
  dailyQuizQuestions,
  markDailyQuizDone,
  recordAnswer,
  wrongQuestionIds,
} from '@/lib/daily_quiz';
import {
  QUESTION_BANK,
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
  | { kind: 'level'; level: ChallengeLevel }
  | { kind: 'wrong' };

export default function ChallengePage() {
  const levels = useMemo(() => levelsIncludingPending(), []);
  const stats = useMemo(() => answerStats(), []);
  const [play, setPlay] = useState<PlayMode | null>(null);
  const [prog, setProg] = useState(levelProgress());
  const [dailyDone, setDailyDone] = useState(false);
  const [showWrongList, setShowWrongList] = useState(false);
  const pending = getPendingBookChallenge();

  useEffect(() => {
    setDailyDone(dailyQuizDone());
  }, [play]);

  const playQuestions: QuestionBankEntry[] | null = useMemo(() => {
    if (!play) return null;
    if (play.kind === 'daily') return dailyQuizQuestions(5);
    if (play.kind === 'random') return randomQuestions(10);
    if (play.kind === 'wrong') {
      const ids = new Set(wrongQuestionIds());
      const qs = QUESTION_BANK.filter((q) => ids.has(q.id));
      return qs.length > 0 ? qs.slice(0, 10) : randomQuestions(5);
    }
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
    setProg(levelProgress());
    setPlay(null);
  };

  if (play && playQuestions) {
    const title =
      play.kind === 'daily'
        ? '每日问答'
        : play.kind === 'random'
          ? '随机挑战'
          : play.kind === 'wrong'
            ? '错题重练'
            : play.kind === 'theme'
              ? play.title
              : play.level.title;
    const sub =
      play.kind === 'daily'
        ? '今日问答'
        : play.kind === 'random'
          ? '随机抽题'
          : play.kind === 'wrong'
            ? '巩固错题'
            : play.kind === 'theme'
              ? '主题闯关'
              : play.level.subtitle;

    return (
      <ChallengeFlipPlay
        title={title}
        subtitle={sub}
        questions={playQuestions}
        hideProgress
        onBack={() => setPlay(null)}
        onFinish={finishPlay}
        onEachAnswer={(id, correct) => recordAnswer(id, correct)}
      />
    );
  }

  const wrongIds = wrongQuestionIds();

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Link href="/" className="icon-btn">←</Link>
        <h2 style={{ margin: 0, fontSize: 'var(--app-heading-size, 18px)', flex: 1 }}>每日问答</h2>
        <span className="muted" style={{ fontSize: 12 }}>{QUESTION_BANK_SIZE} 题</span>
      </header>

      <div className="challenge-mode-row challenge-mode-row-2">
        <button
          type="button"
          className="card challenge-daily-compact"
          onClick={() => setPlay({ kind: 'daily' })}
        >
          <span className="challenge-daily-badge">{dailyDone ? '✓' : '☀'}</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <strong>每日问答</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              {dailyDone ? '今日已完成' : '优先复习错题'}
            </p>
          </div>
        </button>
        <button
          type="button"
          className="card challenge-mode-card-compact"
          onClick={() => setPlay({ kind: 'random' })}
        >
          <span className="challenge-daily-badge">🎲</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <strong>随机挑战</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              随机抽题
            </p>
          </div>
        </button>
      </div>

      <button
        type="button"
        className="card challenge-stats-card"
        style={{ width: '100%', marginTop: 10 }}
        onClick={() => setShowWrongList((v) => !v)}
      >
        <div className="challenge-hero-ring challenge-stats-ring">
          <span>{stats.accuracyPct}%</span>
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <strong>答题统计</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            共答 {stats.total} 题 · 正确 {stats.correct} · 错误 {stats.wrong}
          </p>
        </div>
        <span className="muted">{showWrongList ? '▾' : '▸'}</span>
      </button>

      {showWrongList && (
        <div className="card" style={{ marginTop: 8, padding: 12 }}>
          {wrongIds.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>暂无错题，继续保持！</p>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                {wrongIds.length} 道错题待巩固
              </p>
              <button type="button" className="btn" style={{ width: '100%' }} onClick={() => setPlay({ kind: 'wrong' })}>
                重练错题
              </button>
            </>
          )}
        </div>
      )}

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
            </button>
          );
        })}
      </div>
    </main>
  );
}
