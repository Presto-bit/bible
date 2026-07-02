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
import {
  advancePlanDay,
  markPlanDayCompleted,
  setPlanDay,
  tryAutoCompletePlan,
} from '@/lib/plan_progress';
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
  const [dayCompleted, setDayCompleted] = useState(false);
  const [completedDayNum, setCompletedDayNum] = useState<number | null>(null);
  const stepIdx = meta.steps.findIndex(
    (s) => s.bookId === bookId.toUpperCase() && chapter >= s.chapterStart && chapter <= s.chapterEnd,
  );
  const currentStep = stepIdx >= 0 ? meta.steps[stepIdx] : meta.steps[meta.session.currentStepIndex];
  const showSegmentDone =
    currentStep &&
    isLastChapterOfStep(currentStep, chapter) &&
    !meta.session.stepsDone.includes(currentStep.id);

  // 翻章时自动标记已读过的段（无需逐段点「继续读」）
  useEffect(() => {
    const bid = bookId.toUpperCase();
    let session = meta.session;
    let changed = false;
    for (const step of meta.steps) {
      if (session.stepsDone.includes(step.id)) continue;
      if (step.bookId !== bid) continue;
      if (chapter > step.chapterEnd) {
        session = markStepDone(session, step.id, meta.steps);
        changed = true;
      }
    }
    if (changed) persist(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapter]);

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

  const finishDay = (session: PlanSession) => {
    const finishedDay = meta.day;
    markPlanDayCompleted(meta.planId, finishedDay);
    setPlanDay(meta.planId, finishedDay);
    enqueuePlanProgress(meta.planId, finishedDay, 'done', session);
    advancePlanDay(meta.planId, meta.totalDays);
    tryAutoCompletePlan(meta.planId, meta.totalDays);
    setCompletedDayNum(finishedDay);
    onMetaChange({ ...meta, session, day: Math.min(meta.totalDays, finishedDay + 1) });
    setDayCompleted(true);
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
    finishDay(session);
    setReflectionOpen(false);
  };

  // 今日段落全部读完时自动标记完成（无需再点「完成今天」）
  useEffect(() => {
    if (!allDone || dayCompleted) return;
    const timer = window.setTimeout(() => {
      let session = meta.session;
      for (const step of meta.steps) {
        if (!session.stepsDone.includes(step.id)) {
          session = markStepDone(session, step.id, meta.steps);
        }
      }
      savePlanSession(session);
      finishDay(session);
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, dayCompleted]);

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

      {dayCompleted && completedDayNum != null && (
        <div className="plan-day-complete card">
          <p className="plan-segment-done-title">🎉 第 {completedDayNum} 天已完成</p>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            {prog.total}/{prog.total} 段已读完
            {completedDayNum < meta.totalDays
              ? ` · 明天解锁第 ${completedDayNum + 1} 天`
              : ' · 计划已全部完成'}
          </p>
          <button
            type="button"
            className="font-pill accent"
            style={{ marginTop: 10 }}
            onClick={() => setReflectionOpen(true)}
          >
            写今日反思（可选）
          </button>
        </div>
      )}

      {showSegmentDone && !dayCompleted && (
        <div className="plan-segment-done card">
          <p className="plan-segment-done-title">✓ {currentStep?.label} 已读完</p>
          {nextStep && nextStep.id !== currentStep?.id ? (
            <>
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
            </>
          ) : (
            <button
              type="button"
              className="btn"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => {
                let session = meta.session;
                if (currentStep && !session.stepsDone.includes(currentStep.id)) {
                  session = markStepDone(session, currentStep.id, meta.steps);
                }
                finishDay(session);
              }}
            >
              完成今天
            </button>
          )}
        </div>
      )}

      {allDone && !dayCompleted && (
        <div className="plan-segment-done card plan-segment-all-done">
          <p className="plan-segment-done-title">🎉 今日 {prog.total} 段全部读完</p>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>正在标记今日完成…</p>
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
