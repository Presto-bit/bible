'use client';

import { useEffect, useState } from 'react';
import type { PlanReadingMeta } from '@/lib/plan_reading';
import {
  allStepsDone,
  isLastChapterOfStep,
  nextIncompleteStep,
  sessionProgress,
  type PlanStep,
} from '@/lib/plan_steps';
import {
  markStepDone,
  savePlanSession,
  updateSessionRef,
  type PlanSession,
} from '@/lib/plan_session';
import { advancePlanDay, setPlanDay } from '@/lib/plan_progress';
import { enqueuePlanProgress } from '@/lib/plan_sync';
import { savePlanReflection } from '@/lib/plan_reflection';
import PlanBar from '@/components/reader/PlanBar';

export default function PlanReadingLayer({
  meta,
  bookId,
  chapter,
  onMetaChange,
  onJump,
}: {
  meta: PlanReadingMeta;
  bookId: string;
  chapter: number;
  onMetaChange: (m: PlanReadingMeta) => void;
  onJump: (bookId: string, chapter: number) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const stepIdx = meta.steps.findIndex(
    (s) => s.bookId === bookId.toUpperCase() && chapter >= s.chapterStart && chapter <= s.chapterEnd,
  );
  const currentStep = stepIdx >= 0 ? meta.steps[stepIdx] : meta.steps[meta.session.currentStepIndex];
  const showSegmentDone =
    currentStep &&
    isLastChapterOfStep(currentStep, chapter) &&
    !meta.session.stepsDone.includes(currentStep.id);

  const nextStep = nextIncompleteStep(meta.steps, meta.session.stepsDone);
  const allDone = allStepsDone(meta.steps, meta.session.stepsDone);

  const persist = (session: PlanSession) => {
    savePlanSession(session);
    enqueuePlanProgress(meta.planId, session.day, 'active', session);
    onMetaChange({ ...meta, session });
  };

  const handleJumpStep = (index: number) => {
    const step = meta.steps[index];
    if (!step) return;
    const session = { ...meta.session, currentStepIndex: index, updatedAt: Date.now() };
    persist(session);
    onJump(step.bookId, step.chapterStart);
  };

  const handleContinueSegment = () => {
    if (!currentStep) return;
    let session = markStepDone(meta.session, currentStep.id, meta.steps);
    persist(session);
    const next = nextIncompleteStep(meta.steps, session.stepsDone);
    if (next) {
      const ni = meta.steps.findIndex((s) => s.id === next.id);
      session = { ...session, currentStepIndex: ni };
      persist(session);
      onJump(next.bookId, next.chapterStart);
    }
  };

  const handleCompleteDay = () => {
    setReflectionText('');
    setReflectionOpen(true);
  };

  const confirmCompleteDay = () => {
    let session = meta.session;
    if (currentStep && !session.stepsDone.includes(currentStep.id)) {
      session = markStepDone(session, currentStep.id, meta.steps);
    }
    savePlanSession(session);
    if (reflectionText.trim()) {
      savePlanReflection(meta.planId, meta.day, reflectionText.trim());
    }
    setPlanDay(meta.planId, meta.day);
    enqueuePlanProgress(meta.planId, meta.day, 'done', session);
    advancePlanDay(meta.planId, meta.totalDays);
    onMetaChange({ ...meta, session });
    setReflectionOpen(false);
  };

  useEffect(() => {
    const ref = `${bookId}.${chapter}`;
    if (meta.session.lastRef === ref) return;
    const session = updateSessionRef(meta.session, ref);
    savePlanSession(session);
    enqueuePlanProgress(meta.planId, session.day, 'active', session);
    onMetaChange({ ...meta, session });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapter]);

  const prog = sessionProgress(meta.steps, meta.session.stepsDone);

  return (
    <>
      <PlanBar
        meta={meta}
        onOpenSheet={() => setSheetOpen(true)}
        onJumpStep={handleJumpStep}
      />

      {showSegmentDone && nextStep && nextStep.id !== currentStep?.id && (
        <div className="plan-segment-done card">
          <p className="plan-segment-done-title">✓ {currentStep?.label} 已读完</p>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>
            下一段：{nextStep.label}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={handleContinueSegment}>
              继续读 {nextStep.label.split(' ')[0] ?? '下一段'} ›
            </button>
            <button type="button" className="book-chip" style={{ flex: 1 }} onClick={() => setSheetOpen(true)}>
              稍后继续
            </button>
          </div>
        </div>
      )}

      {allDone && (
        <div className="plan-segment-done card plan-segment-all-done">
          <p className="plan-segment-done-title">🎉 今日 {prog.total} 段全部读完</p>
          <button type="button" className="btn" style={{ width: '100%', marginTop: 10 }} onClick={handleCompleteDay}>
            完成今天
          </button>
        </div>
      )}

      {reflectionOpen && (
        <div className="sheet-backdrop" onClick={() => setReflectionOpen(false)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>今日反思（可选）</strong>
              <button type="button" className="text-link" onClick={() => setReflectionOpen(false)}>跳过</button>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              用一两句话记下今天的感动或应用。
            </p>
            <textarea
              className="group-composer-text"
              rows={3}
              placeholder="今天神对我说…"
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
            />
            <button type="button" className="btn" style={{ width: '100%', marginTop: 10 }} onClick={confirmCompleteDay}>
              完成今天
            </button>
          </div>
        </div>
      )}

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>今日安排 · 第 {meta.day} 天</strong>
              <button type="button" className="text-link" onClick={() => setSheetOpen(false)}>关闭</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              {prog.done}/{prog.total} 段已完成
            </p>
            {meta.steps.map((s, i) => (
              <StepRow
                key={s.id}
                step={s}
                index={i}
                done={meta.session.stepsDone.includes(s.id)}
                active={i === stepIdx}
                onGo={() => { handleJumpStep(i); setSheetOpen(false); }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function StepRow({
  step,
  index,
  done,
  active,
  onGo,
}: {
  step: PlanStep;
  index: number;
  done: boolean;
  active: boolean;
  onGo: () => void;
}) {
  return (
    <button type="button" className={`plan-read-step plan-read-step-row ${done ? 'plan-read-step-done' : ''} ${active ? 'plan-read-step-active' : ''}`} onClick={onGo}>
      <span className="plan-read-step-dot">{done ? '✓' : index + 1}</span>
      <span className="plan-read-step-label">{step.label}</span>
      <span className="plan-read-step-go">{active ? '当前' : '去读 ›'}</span>
    </button>
  );
}
