'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import type { ChallengeQuestion } from '@/lib/challenge_levels';
import { dailyWarmupFinishLine, quizAnswerPill } from '@/lib/beiai_habit_copy';
import { localizeRefsInText, refToChineseLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

type Phase = 'pick' | 'flip' | 'answer' | 'done';

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

  const advance = (wasCorrect: boolean) => {
    const nextCorrect = correctCount + (wasCorrect ? 1 : 0);
    if (qIdx + 1 >= questions.length) {
      setCorrectCount(nextCorrect);
      setFinalScore({ correct: nextCorrect, total: questions.length });
      setPhase('done');
      if (!softMode) {
        setTimeout(() => onFinish(nextCorrect, questions.length), 900);
      }
    } else {
      setTimeout(() => {
        setCorrectCount(nextCorrect);
        setQIdx((x) => x + 1);
        setPicked(null);
        setPhase('pick');
      }, softMode ? 1600 : 1400);
    }
  };

  const pick = (i: number) => {
    if (!q || picked != null || phase !== 'pick') return;
    setPicked(i);
    setPhase('flip');
    const ok = i === q.answer;
    onEachAnswer?.(q.id, ok);
    setTimeout(() => setPhase('answer'), 380);
    setTimeout(() => advance(ok), softMode ? 1800 : 1400);
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
          <span className="muted">{title}</span>
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

  const flipped = phase === 'answer';
  const readerHref = q.ref ? readerHrefFromRef(q.ref) : null;

  return (
    <main className="container challenge-play">
      <header className="challenge-play-head">
        <PageBackBar variant="page" onClick={onBack} label="返回" />
        <span className="muted">{title}</span>
      </header>
      {softMode ? (
        <p className="challenge-soft-step muted" aria-live="polite">
          {qIdx + 1} / {questions.length}
        </p>
      ) : !hideProgress ? (
        <div className="challenge-progress-bar">
          <div style={{ width: `${((qIdx + (flipped ? 1 : 0)) / questions.length) * 100}%` }} />
        </div>
      ) : null}
      <div className={`challenge-flip-wrap ${phase === 'flip' || flipped ? 'challenge-flip-active' : ''}`}>
        <div className="challenge-flip-inner">
          <div className="challenge-flip-front card challenge-q-card">
            <span className="pill">{subtitle}</span>
            {q.ref && (
              <p className="challenge-q-ref muted">{refToChineseLabel(q.ref) ?? q.ref}</p>
            )}
            <p className="quiz-q">{localizeRefsInText(q.question)}</p>
            <div className="quiz-options">
              {q.options.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  className="quiz-opt"
                  onClick={() => pick(i)}
                  disabled={picked != null}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div className="challenge-flip-back card challenge-q-card">
            <span className={`pill ${picked === q.answer ? 'pill-active' : ''}`}>
              {quizAnswerPill(picked === q.answer)}
            </span>
            <p className="quiz-q quiz-answer">{q.options[q.answer]}</p>
            <p className="quiz-explain">{localizeRefsInText(q.explain)}</p>
            {q.ref ? (
              <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                {readerHref ? (
                  <Link
                    href={readerHref}
                    className="text-link"
                    onClick={() => markRouteNavigation()}
                  >
                    去读 {refToChineseLabel(q.ref) ?? q.ref} ›
                  </Link>
                ) : (
                  <>参考：{refToChineseLabel(q.ref) ?? q.ref}</>
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
