'use client';

import { useEffect, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import type { ChallengeQuestion } from '@/lib/challenge_levels';
import { localizeRefsInText, refToChineseLabel } from '@/lib/ref_label';

type Phase = 'pick' | 'flip' | 'answer';

export default function ChallengeFlipPlay({
  title,
  subtitle,
  questions,
  onBack,
  onFinish,
  onEachAnswer,
  hideProgress,
}: {
  title: string;
  subtitle: string;
  questions: ChallengeQuestion[];
  onBack: () => void;
  onFinish: (correct: number, total: number) => void;
  onEachAnswer?: (questionId: string, correct: boolean) => void;
  hideProgress?: boolean;
}) {
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [phase, setPhase] = useState<Phase>('pick');

  const q = questions[qIdx];

  const advance = (wasCorrect: boolean) => {
    const nextCorrect = correctCount + (wasCorrect ? 1 : 0);
    if (qIdx + 1 >= questions.length) {
      setTimeout(() => onFinish(nextCorrect, questions.length), 1200);
    } else {
      setTimeout(() => {
        setCorrectCount(nextCorrect);
        setQIdx((x) => x + 1);
        setPicked(null);
        setPhase('pick');
      }, 1400);
    }
  };

  const pick = (i: number) => {
    if (!q || picked != null || phase !== 'pick') return;
    setPicked(i);
    setPhase('flip');
    const ok = i === q.answer;
    onEachAnswer?.(q.id, ok);
    setTimeout(() => setPhase('answer'), 380);
    setTimeout(() => advance(ok), 1400);
  };

  useEffect(() => {
    setQIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setPhase('pick');
  }, [questions]);

  if (!q) return null;

  const flipped = phase === 'answer';

  return (
    <main className="container challenge-play">
      <header className="challenge-play-head">
        <PageBackBar variant="page" onClick={onBack} label="返回" />
        <span className="muted">{title}</span>
      </header>
      {!hideProgress && (
        <div className="challenge-progress-bar">
          <div style={{ width: `${((qIdx + (flipped ? 1 : 0)) / questions.length) * 100}%` }} />
        </div>
      )}
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
              {picked === q.answer ? '回答正确 ✓' : '正确答案'}
            </span>
            <p className="quiz-q quiz-answer">{q.options[q.answer]}</p>
            <p className="quiz-explain">{localizeRefsInText(q.explain)}</p>
            {q.ref && (
              <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>参考：{refToChineseLabel(q.ref) ?? q.ref}</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
