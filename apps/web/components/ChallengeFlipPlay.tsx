'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import type { ChallengeQuestion } from '@/lib/challenge_levels';
import { dailyWarmupFinishLine, quizAnswerPill } from '@/lib/beiai_habit_copy';
import { localizeRefsInText, refToChineseLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

type Phase = 'pick' | 'reveal' | 'done';

export default function ChallengeFlipPlay({
  title,
  subtitle,
  questions,
  onBack,
  onFinish,
  onEachAnswer,
  hideProgress,
  softMode,
}: {
  title: string;
  subtitle: string;
  questions: ChallengeQuestion[];
  onBack: () => void;
  onFinish: (correct: number, total: number) => void;
  onEachAnswer?: (questionId: string, correct: boolean) => void;
  hideProgress?: boolean;
  /** 今日温习：去闯关感，完成页可停留 */
  softMode?: boolean;
}) {
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [phase, setPhase] = useState<Phase>('pick');
  const [finalScore, setFinalScore] = useState<{ correct: number; total: number } | null>(null);

  const q = questions[qIdx];

  // 左缘右滑退出本局（不走路由）
  useEffect(() => {
    const EDGE_PX = 24;
    const MIN_DX = 72;
    const MAX_DY = 48;
    let tracking: { x: number; y: number; active: boolean } | null = null;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > EDGE_PX) return;
      tracking = { x: t.clientX, y: t.clientY, active: true };
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking?.active || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - tracking.x;
      const dy = Math.abs(t.clientY - tracking.y);
      if (dy > MAX_DY && dy > Math.abs(dx)) tracking.active = false;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking?.active) {
        tracking = null;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - tracking.x;
      tracking = null;
      if (dx >= MIN_DX) {
        if (phase === 'done' && finalScore) {
          onFinish(finalScore.correct, finalScore.total);
        } else {
          onBack();
        }
      }
    };
    const onCancel = () => {
      tracking = null;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [onBack, onFinish, phase, finalScore]);

  const pick = (i: number) => {
    if (!q || picked != null || phase !== 'pick') return;
    setPicked(i);
    const ok = i === q.answer;
    onEachAnswer?.(q.id, ok);
    setCorrectCount((c) => c + (ok ? 1 : 0));
    setPhase('reveal');
  };

  const goNext = () => {
    if (phase !== 'reveal' || picked == null) return;
    if (qIdx + 1 >= questions.length) {
      setFinalScore({ correct: correctCount, total: questions.length });
      setPhase('done');
      if (!softMode) {
        setTimeout(() => onFinish(correctCount, questions.length), 400);
      }
      return;
    }
    setQIdx((x) => x + 1);
    setPicked(null);
    setPhase('pick');
  };

  useEffect(() => {
    setQIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setPhase('pick');
    setFinalScore(null);
  }, [questions]);

  if (phase === 'done' && finalScore) {
    const line = softMode
      ? dailyWarmupFinishLine(finalScore.correct, finalScore.total)
      : '温习过了，继续保持就好';
    const close = () => onFinish(finalScore.correct, finalScore.total);
    return (
      <main className="container challenge-play">
        <header className="challenge-play-head">
          <PageBackBar variant="page" onClick={close} label="返回" />
          <span className="challenge-play-head-title muted">{title}</span>
          <span className="challenge-play-head-step muted" aria-hidden>
            {'\u00a0'}
          </span>
        </header>
        <div className="card challenge-q-card challenge-finish-card challenge-finish-soft">
          <p className="challenge-finish-kicker muted">今日温习</p>
          <strong className="challenge-finish-title">{line}</strong>
          <p className="muted challenge-finish-score">
            答对 {finalScore.correct} / {finalScore.total}
          </p>
          <div className="challenge-finish-actions">
            <button type="button" className="btn" onClick={close}>
              完成
            </button>
            <Link
              href="/"
              className="text-link"
              onClick={() => {
                close();
                markRouteNavigation();
              }}
            >
              回首页 ›
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!q) return null;

  const revealed = phase === 'reveal';
  const readerHref = q.ref ? readerHrefFromRef(q.ref) : null;
  const isLast = qIdx + 1 >= questions.length;
  const showStep = softMode || !hideProgress;

  return (
    <main className="container challenge-play">
      <header className="challenge-play-head">
        <PageBackBar variant="page" onClick={onBack} label="返回" />
        <span className="challenge-play-head-title muted">{title}</span>
        {showStep ? (
          <span className="challenge-play-head-step muted" aria-live="polite">
            {qIdx + 1} / {questions.length}
          </span>
        ) : (
          <span className="challenge-play-head-step" aria-hidden />
        )}
      </header>

      <div className="challenge-play-body">
        <div className="card challenge-q-card challenge-q-card-static">
          <span className="pill">{subtitle}</span>
          {q.ref ? (
            readerHref ? (
              <Link
                href={readerHref}
                className="challenge-q-ref text-link"
                onClick={() => markRouteNavigation()}
              >
                {refToChineseLabel(q.ref) ?? q.ref}
              </Link>
            ) : (
              <p className="challenge-q-ref muted">{refToChineseLabel(q.ref) ?? q.ref}</p>
            )
          ) : null}
          <p className="quiz-q">{localizeRefsInText(q.question)}</p>
          <div className="quiz-options">
            {q.options.map((o, i) => {
              let optClass = 'quiz-opt';
              if (revealed) {
                if (i === q.answer) optClass += ' quiz-opt-correct';
                else if (i === picked) optClass += ' quiz-opt-wrong';
                else optClass += ' quiz-opt-dim';
              }
              return (
                <button
                  key={i}
                  type="button"
                  className={optClass}
                  onClick={() => pick(i)}
                  disabled={picked != null}
                >
                  {o}
                </button>
              );
            })}
          </div>

          {revealed ? (
            <div className="challenge-reveal">
              <span className={`pill ${picked === q.answer ? 'pill-active' : ''}`}>
                {quizAnswerPill(picked === q.answer)}
              </span>
              <p className="quiz-explain">{localizeRefsInText(q.explain)}</p>
            </div>
          ) : null}
        </div>
      </div>

      {revealed ? (
        <div className="challenge-play-footer">
          <button type="button" className="btn challenge-play-next" onClick={goNext}>
            {isLast ? '看结果' : '下一题'}
          </button>
          {q.ref && readerHref ? (
            <Link
              href={readerHref}
              className="text-link challenge-play-read"
              onClick={() => markRouteNavigation()}
            >
              去读 {refToChineseLabel(q.ref) ?? q.ref} ›
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
