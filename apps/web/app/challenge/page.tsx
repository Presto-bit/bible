'use client';

import { useEffect, useMemo, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
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
  dailyWarmupCta,
  dailyWarmupHubHint,
  dailyWarmupSubtitle,
  dailyWarmupTitle,
} from '@/lib/beiai_habit_copy';
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
  const [moreOpen, setMoreOpen] = useState(false);
  const pending = getPendingBookChallenge();

  useEdgeSwipeBack({ href: '/profile', enabled: !play });

  useEffect(() => {
    setDailyDone(dailyQuizDone());
  }, [play]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('start') !== 'daily') return;
    setPlay({ kind: 'daily' });
    sp.delete('start');
    const q = sp.toString();
    window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : ''));
  }, []);

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
      void import('@/lib/product_events').then((m) =>
        m.trackProductEvent('warmup_finish', {
          props: { correct, total },
          oncePerDay: true,
        }),
      );
    }
    setProg(levelProgress());
    setPlay(null);
  };

  if (play && playQuestions) {
    const soft = play.kind === 'daily';
    const title =
      play.kind === 'daily'
        ? dailyWarmupTitle()
        : play.kind === 'random'
          ? '随手几题'
          : play.kind === 'wrong'
            ? '错题再读'
            : play.kind === 'theme'
              ? play.title
              : play.level.title;
    const sub =
      play.kind === 'daily'
        ? '轻问'
        : play.kind === 'random'
          ? '随机'
          : play.kind === 'wrong'
            ? '巩固'
            : play.kind === 'theme'
              ? '主题'
              : play.level.subtitle;

    return (
      <ChallengeFlipPlay
        title={title}
        subtitle={sub}
        questions={playQuestions}
        hideProgress={soft}
        softMode={soft}
        onBack={() => setPlay(null)}
        onFinish={finishPlay}
        onEachAnswer={(id, correct) => recordAnswer(id, correct)}
      />
    );
  }

  const wrongIds = wrongQuestionIds();

  return (
    <main className="container challenge-warmup-page">
      <header className="page-head challenge-warmup-head">
        <PageBackBar href="/profile" label="我的" />
        <h2 className="page-head-title">{dailyWarmupTitle()}</h2>
      </header>

      <section className="challenge-warmup-hero" aria-labelledby="warmup-hero-title">
        <p className="challenge-warmup-hero-kicker muted">
          {dailyDone ? '已完成' : '今天'}
        </p>
        <h3 id="warmup-hero-title" className="challenge-warmup-hero-title">
          {dailyWarmupSubtitle(dailyDone)}
        </h3>
        <p className="muted challenge-warmup-hero-sub">
          {dailyWarmupHubHint(dailyDone)}
        </p>
        <button
          type="button"
          className="btn challenge-warmup-start"
          onClick={() => setPlay({ kind: 'daily' })}
        >
          {dailyWarmupCta(dailyDone)}
        </button>
      </section>

      {wrongIds.length > 0 ? (
        <button
          type="button"
          className="card challenge-warmup-secondary"
          onClick={() => setPlay({ kind: 'wrong' })}
        >
          <strong>错题再读</strong>
          <span className="muted">{wrongIds.length} 道 · 不赶进度</span>
        </button>
      ) : null}

      {pending ? (
        <div className="card challenge-warmup-secondary">
          <strong>读完 {pending.bookName}</strong>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            想巩固一下也可以，随时可跳过
          </p>
          <button
            type="button"
            className="text-link"
            style={{ marginTop: 8 }}
            onClick={() => {
              const lv = levels.find((l) => l.id === pending.levelId);
              if (lv) setPlay({ kind: 'level', level: lv });
            }}
          >
            开始巩固 ›
          </button>
        </div>
      ) : null}

      <p className="muted challenge-warmup-stats">
        {stats.total > 0
          ? `曾温习 ${stats.total} 题`
          : `题库 ${QUESTION_BANK_SIZE} 题，每天五道就好`}
      </p>

      <button
        type="button"
        className="text-link challenge-warmup-more-toggle"
        onClick={() => setMoreOpen((v) => !v)}
      >
        {moreOpen ? '收起更多' : '更多温习方式 ›'}
      </button>

      {moreOpen ? (
        <div className="challenge-warmup-more">
          <button
            type="button"
            className="card challenge-warmup-secondary"
            onClick={() => setPlay({ kind: 'random' })}
          >
            <strong>随手几题</strong>
            <span className="muted">随机抽题，不计成就</span>
          </button>

          <p className="section-label tab-section-label">按主题</p>
          <div className="challenge-level-grid">
            {QUESTION_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="challenge-level-card"
                onClick={() => setPlay({ kind: 'theme', themeId: t.id, title: t.name })}
              >
                <strong>{t.name}</strong>
              </button>
            ))}
          </div>

          <p className="section-label tab-section-label">书卷巩固</p>
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
                  <strong>{lv.title}</strong>
                  <span className="muted" style={{ fontSize: 11 }}>{lv.subtitle}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </main>
  );
}
