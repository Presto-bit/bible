'use client';

import Link from 'next/link';
import { SheetCloseButton } from '@/components/PageBackBar';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Group } from '@/lib/api';
import type { PlanReadingMeta } from '@/lib/plan_reading';
import {
  isForwardStepBoundary,
  isChapterInPlan,
  type PlanNavGuard,
} from '@/lib/plan_navigation';
import {
  allStepsDone,
  isLastChapterOfStep,
  nextIncompleteStep,
  pendingNextStep,
  sessionProgress,
  type PlanStep,
} from '@/lib/plan_steps';
import {
  markStepDone,
  savePlanSession,
  updateSessionRef,
  type PlanSession,
} from '@/lib/plan_session';
import { advancePlanDay, isPlanDayCompleted, markPlanDayCompleted, setPlanDay, tryAutoCompletePlan } from '@/lib/plan_progress';
import { enqueuePlanProgress } from '@/lib/plan_sync';
import { savePlanReflection } from '@/lib/plan_reflection';
import { groupCheckinHref, groupsBoundToPlan, loadOwnerGroups } from '@/lib/plan_group_share';
import { PlanShareToGroupSheet } from '@/components/plans/PlanShareToGroupSheet';
import PlanBar from '@/components/reader/PlanBar';

export type { PlanNavGuard };

export default function PlanReadingLayer({
  meta,
  bookId,
  chapter,
  chapterBottomTick,
  checkinGroupId,
  onMetaChange,
  onJump,
  onOverlayChange,
  onPlanDayFinished,
  onContinueNextDay,
  bindNavGuard,
}: {
  meta: PlanReadingMeta;
  bookId: string;
  chapter: number;
  chapterBottomTick?: number;
  checkinGroupId?: string | null;
  onMetaChange: (m: PlanReadingMeta) => void;
  onJump: (bookId: string, chapter: number) => void;
  onOverlayChange?: (open: boolean) => void;
  onPlanDayFinished?: () => void;
  /** 完日庆祝后开始下一天（不自动退出计划模式） */
  onContinueNextDay?: (nextDay: number) => void;
  bindNavGuard?: (guard: PlanNavGuard | null) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const [dayCompleted, setDayCompleted] = useState(false);
  const [completedDayNum, setCompletedDayNum] = useState<number | null>(null);
  const [planAllDone, setPlanAllDone] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [boundGroups, setBoundGroups] = useState<Group[]>([]);
  const bottomHandledRef = useRef(0);
  const finishedDayRef = useRef<number | null>(null);
  const celebrationDismissedRef = useRef<Set<number>>(new Set());

  const stepIdx = meta.steps.findIndex(
    (s) => s.bookId === bookId.toUpperCase() && chapter >= s.chapterStart && chapter <= s.chapterEnd,
  );
  const currentStep = stepIdx >= 0 ? meta.steps[stepIdx] : meta.steps[meta.session.currentStepIndex];
  const inPlanRange = isChapterInPlan(meta.steps, bookId, chapter);
  const segmentNext = pendingNextStep(meta.steps, meta.session.stepsDone, bookId, chapter);

  const persist = useCallback((session: PlanSession) => {
    savePlanSession(session);
    enqueuePlanProgress(meta.planId, session.day, 'active', session);
    onMetaChange({ ...meta, session });
  }, [meta, onMetaChange]);

  const finishDay = useCallback((session: PlanSession) => {
    const dayToFinish = session.day;
    if (dayToFinish !== meta.day) return;
    if (isPlanDayCompleted(meta.planId, dayToFinish) || finishedDayRef.current === dayToFinish) {
      return;
    }
    if (celebrationDismissedRef.current.has(dayToFinish)) return;
    finishedDayRef.current = dayToFinish;
    markPlanDayCompleted(meta.planId, dayToFinish);
    setPlanDay(meta.planId, dayToFinish);
    enqueuePlanProgress(meta.planId, dayToFinish, 'done', session);
    advancePlanDay(meta.planId, meta.totalDays);
    const allDone = tryAutoCompletePlan(meta.planId, meta.totalDays);
    setCompletedDayNum(dayToFinish);
    onMetaChange({ ...meta, session, day: Math.min(meta.totalDays, dayToFinish + 1) });
    setDayCompleted(true);
    if (allDone || dayToFinish >= meta.totalDays) {
      setPlanAllDone(true);
    }
    onPlanDayFinished?.();
  }, [meta, onMetaChange, onPlanDayFinished]);

  const completeCurrentStepAndJump = useCallback((
    targetBookId: string,
    targetChapter: number,
    stepToComplete?: PlanStep,
  ) => {
    let session = meta.session;
    const step = stepToComplete ?? currentStep;
    if (step && !session.stepsDone.includes(step.id)) {
      session = markStepDone(session, step.id, meta.steps);
      persist(session);
    }
    const nextIdx = meta.steps.findIndex((s) => s.bookId === targetBookId.toUpperCase() && targetChapter >= s.chapterStart);
    if (nextIdx >= 0) {
      session = { ...session, currentStepIndex: nextIdx, updatedAt: Date.now() };
      persist(session);
    }
    onJump(targetBookId, targetChapter);
  }, [meta, currentStep, persist, onJump]);

  useEffect(() => {
    onOverlayChange?.(sheetOpen || reflectionOpen || shareOpen || planAllDone || dayCompleted);
  }, [sheetOpen, reflectionOpen, shareOpen, planAllDone, dayCompleted, onOverlayChange]);

  useEffect(() => {
    if (!dayCompleted && !planAllDone) return;
    void loadOwnerGroups().then((gs) => setBoundGroups(groupsBoundToPlan(gs, meta.planId)));
  }, [dayCompleted, planAllDone, meta.planId]);

  useEffect(() => {
    if (!bindNavGuard) return;
    const guard: PlanNavGuard = {
      shouldConfirmForward: (from, target) =>
        isForwardStepBoundary(meta.steps, from, target),
      onForwardBoundary: (target, proceed) => {
        if (currentStep) {
          completeCurrentStepAndJump(target.bookId, target.chapter, currentStep);
        } else {
          proceed();
        }
      },
    };
    bindNavGuard(guard);
    return () => bindNavGuard(null);
  }, [bindNavGuard, meta.steps, meta.session.stepsDone, currentStep, completeCurrentStepAndJump]);

  const dismissDayCelebration = () => {
    if (completedDayNum != null) celebrationDismissedRef.current.add(completedDayNum);
    setDayCompleted(false);
    setCompletedDayNum(null);
  };

  const handleJumpStep = (index: number) => {
    const step = meta.steps[index];
    if (!step) return;
    const session = { ...meta.session, currentStepIndex: index, updatedAt: Date.now() };
    persist(session);
    onJump(step.bookId, step.chapterStart);
  };

  const saveReflection = () => {
    if (reflectionText.trim()) {
      savePlanReflection(meta.planId, meta.day, reflectionText.trim());
    }
    setReflectionOpen(false);
  };

  const confirmCompleteDay = () => {
    saveReflection();
    let session = meta.session;
    if (currentStep && !session.stepsDone.includes(currentStep.id)) {
      session = markStepDone(session, currentStep.id, meta.steps);
    }
    savePlanSession(session);
    finishDay(session);
  };

  // 滑到 Step 末章：标记段完成（不自动跳卷，由底部卡片或翻页确认引导）
  useEffect(() => {
    if (!chapterBottomTick || dayCompleted) return;
    if (meta.session.day !== meta.day) return;
    if (isPlanDayCompleted(meta.planId, meta.day)) return;
    if (finishedDayRef.current === meta.day) return;
    if (bottomHandledRef.current === chapterBottomTick) return;
    if (!currentStep || !isLastChapterOfStep(currentStep, chapter)) return;

    bottomHandledRef.current = chapterBottomTick;
    let session = meta.session;
    if (!session.stepsDone.includes(currentStep.id)) {
      session = markStepDone(session, currentStep.id, meta.steps);
      persist(session);
    }

    if (allStepsDone(meta.steps, session.stepsDone)) {
      finishDay(session);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterBottomTick, chapter, currentStep?.id, dayCompleted]);

  useEffect(() => {
    if (dayCompleted) return;
    if (meta.session.day !== meta.day) return;
    if (isPlanDayCompleted(meta.planId, meta.day)) return;
    if (finishedDayRef.current === meta.day) return;
    if (!allStepsDone(meta.steps, meta.session.stepsDone)) return;
    const timer = window.setTimeout(() => finishDay(meta.session), 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.session.stepsDone, meta.session.day, meta.day, dayCompleted]);

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
  const checkinGid = checkinGroupId || boundGroups[0]?.id;
  const checkinRef = `${bookId}.${chapter}`;

  return (
    <>
      <PlanBar
        meta={meta}
        onOpenSheet={() => setSheetOpen(true)}
        onJumpStep={handleJumpStep}
      />

      {!inPlanRange && (
        <div className="plan-out-of-range card">
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            当前章节不在今日计划内
          </p>
          <button
            type="button"
            className="font-pill accent"
            style={{ marginTop: 8 }}
            onClick={() => handleJumpStep(meta.session.currentStepIndex)}
          >
            回到计划进度 ›
          </button>
        </div>
      )}

      {segmentNext && !dayCompleted && inPlanRange && (
        <div className="plan-segment-footer card">
          <p className="plan-segment-done-title" style={{ fontSize: 14, margin: 0 }}>
            ✓ {currentStep?.label} 已读完
          </p>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            下一段：{segmentNext.label}
          </p>
          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => completeCurrentStepAndJump(segmentNext.bookId, segmentNext.chapterStart, currentStep)}
          >
            继续读 {segmentNext.label} ›
          </button>
        </div>
      )}

      {planAllDone && (
        <div className="plan-day-complete card plan-plan-complete-sheet plan-day-complete-solid">
          <p className="plan-segment-done-title">🎉 「{meta.planTitle}」已全部完成</p>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px', lineHeight: 1.5 }}>
            共 {meta.totalDays} 天 · 可在计划页「已完成」中查看或再读一遍
          </p>
          <div className="plan-complete-actions">
            <Link href="/plans?tab=completed" className="font-pill">查看计划</Link>
            {checkinGid ? (
              <Link href={groupCheckinHref(checkinGid, checkinRef)} className="font-pill accent">
                去群里打卡 ›
              </Link>
            ) : (
              <button type="button" className="font-pill accent" onClick={() => setShareOpen(true)}>
                分享到群打卡
              </button>
            )}
          </div>
          <button
            type="button"
            className="text-link"
            style={{ marginTop: 10 }}
            onClick={() => setPlanAllDone(false)}
          >
            继续浏览经文
          </button>
        </div>
      )}

      {dayCompleted && completedDayNum != null && !planAllDone
        && !celebrationDismissedRef.current.has(completedDayNum) && (
        <div className="plan-day-complete card plan-day-complete-toast plan-day-complete-solid">
          <div className="plan-day-complete-head">
            <p className="plan-segment-done-title">🎉 第 {completedDayNum} 天已完成</p>
            <button
              type="button"
              className="text-link"
              aria-label="关闭"
              onClick={dismissDayCelebration}
            >
              关闭
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            {prog.total}/{prog.total} 段已读完
            {completedDayNum < meta.totalDays
              ? ` · 可以开始第 ${completedDayNum + 1} 天`
              : ' · 计划已全部完成'}
          </p>
          <div className="plan-complete-actions" style={{ marginTop: 10 }}>
            {completedDayNum < meta.totalDays && onContinueNextDay && (
              <button
                type="button"
                className="btn"
                style={{ width: '100%', marginBottom: 8 }}
                onClick={() => {
                  const next = completedDayNum + 1;
                  dismissDayCelebration();
                  onContinueNextDay(next);
                }}
              >
                开始第 {completedDayNum + 1} 天 ›
              </button>
            )}
            {checkinGid ? (
              <Link
                href={groupCheckinHref(checkinGid, checkinRef)}
                className="font-pill accent"
              >
                去群里打卡 ›
              </Link>
            ) : (
              <button type="button" className="font-pill accent" onClick={() => setShareOpen(true)}>
                分享到群打卡
              </button>
            )}
            <button
              type="button"
              className="font-pill"
              onClick={() => setReflectionOpen(true)}
            >
              写今日反思
            </button>
          </div>
          <button
            type="button"
            className="text-link"
            style={{ marginTop: 10 }}
            onClick={dismissDayCelebration}
          >
            稍后再读，继续浏览经文
          </button>
        </div>
      )}

      {reflectionOpen && (
        <div className="sheet-backdrop plan-reflection-backdrop">
          <div className="sheet card plan-reflection-sheet">
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>今日反思（可选）</strong>
              <SheetCloseButton onClick={() => setReflectionOpen(false)} />
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              用一两句话记下今天的感动或应用。不填写可直接关闭。
            </p>
            <textarea
              className="group-composer-text"
              rows={3}
              placeholder="今天神对我说…"
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
            />
            <button type="button" className="btn" style={{ width: '100%', marginTop: 10 }} onClick={saveReflection}>
              保存反思
            </button>
          </div>
        </div>
      )}

      <PlanShareToGroupSheet
        open={shareOpen}
        planId={meta.planId}
        planTitle={meta.planTitle}
        checkinRef={checkinRef}
        onClose={() => setShareOpen(false)}
        onBound={(gid) => {
          setShareOpen(false);
          window.location.href = groupCheckinHref(gid, checkinRef);
        }}
      />

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>今日安排 · 第 {meta.day} 天</strong>
              <SheetCloseButton onClick={() => setSheetOpen(false)} />
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              {prog.done}/{prog.total} 段已完成 · 计划模式仅可跳转今日章节
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
