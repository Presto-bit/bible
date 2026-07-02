'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Group } from '@/lib/api';
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
import { advancePlanDay, isPlanDayCompleted, markPlanDayCompleted, setPlanDay, tryAutoCompletePlan } from '@/lib/plan_progress';
import { enqueuePlanProgress } from '@/lib/plan_sync';
import { savePlanReflection } from '@/lib/plan_reflection';
import { groupCheckinHref, groupsBoundToPlan, loadOwnerGroups } from '@/lib/plan_group_share';
import { PlanShareToGroupSheet } from '@/components/plans/PlanShareToGroupSheet';
import PlanBar from '@/components/reader/PlanBar';

const CELEBRATE_MS = 4200;

export default function PlanReadingLayer({
  meta,
  bookId,
  chapter,
  chapterBottomTick,
  checkinGroupId,
  onMetaChange,
  onJump,
  onOverlayChange,
}: {
  meta: PlanReadingMeta;
  bookId: string;
  chapter: number;
  chapterBottomTick?: number;
  checkinGroupId?: string | null;
  onMetaChange: (m: PlanReadingMeta) => void;
  onJump: (bookId: string, chapter: number) => void;
  onOverlayChange?: (open: boolean) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const [dayCompleted, setDayCompleted] = useState(false);
  const [completedDayNum, setCompletedDayNum] = useState<number | null>(null);
  const [planAllDone, setPlanAllDone] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [boundGroups, setBoundGroups] = useState<Group[]>([]);
  const [nextStepHint, setNextStepHint] = useState<string | null>(null);
  const bottomHandledRef = useRef(0);
  const finishedDayRef = useRef<number | null>(null);

  useEffect(() => {
    onOverlayChange?.(sheetOpen || reflectionOpen || shareOpen || planAllDone);
  }, [sheetOpen, reflectionOpen, shareOpen, planAllDone, onOverlayChange]);

  useEffect(() => {
    if (!dayCompleted && !planAllDone) return;
    void loadOwnerGroups().then((gs) => setBoundGroups(groupsBoundToPlan(gs, meta.planId)));
  }, [dayCompleted, planAllDone, meta.planId]);

  const stepIdx = meta.steps.findIndex(
    (s) => s.bookId === bookId.toUpperCase() && chapter >= s.chapterStart && chapter <= s.chapterEnd,
  );
  const currentStep = stepIdx >= 0 ? meta.steps[stepIdx] : meta.steps[meta.session.currentStepIndex];

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

  const persist = (session: PlanSession) => {
    savePlanSession(session);
    enqueuePlanProgress(meta.planId, session.day, 'active', session);
    onMetaChange({ ...meta, session });
  };

  const finishDay = (session: PlanSession) => {
    if (isPlanDayCompleted(meta.planId, meta.day) || finishedDayRef.current === meta.day) {
      return;
    }
    finishedDayRef.current = meta.day;
    const finishedDay = meta.day;
    markPlanDayCompleted(meta.planId, finishedDay);
    setPlanDay(meta.planId, finishedDay);
    enqueuePlanProgress(meta.planId, finishedDay, 'done', session);
    advancePlanDay(meta.planId, meta.totalDays);
    const allDone = tryAutoCompletePlan(meta.planId, meta.totalDays);
    setCompletedDayNum(finishedDay);
    onMetaChange({ ...meta, session, day: Math.min(meta.totalDays, finishedDay + 1) });
    setDayCompleted(true);
    if (allDone || finishedDay >= meta.totalDays) {
      setPlanAllDone(true);
    }
    setNextStepHint(null);
  };

  const handleJumpStep = (index: number) => {
    const step = meta.steps[index];
    if (!step) return;
    const session = { ...meta.session, currentStepIndex: index, updatedAt: Date.now() };
    persist(session);
    onJump(step.bookId, step.chapterStart);
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

  // 滑到章末：自动标记段完成 / 今日完成
  useEffect(() => {
    if (!chapterBottomTick || dayCompleted) return;
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
      return;
    }

    const next = nextIncompleteStep(meta.steps, session.stepsDone);
    if (next) {
      setNextStepHint(next.label);
      window.setTimeout(() => setNextStepHint(null), 3500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterBottomTick, chapter, currentStep?.id, dayCompleted]);

  // 全部段已读完时兜底自动完成（当日仅触发一次）
  useEffect(() => {
    if (dayCompleted) return;
    if (isPlanDayCompleted(meta.planId, meta.day)) return;
    if (!allStepsDone(meta.steps, meta.session.stepsDone)) return;
    const timer = window.setTimeout(() => finishDay(meta.session), 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.session.stepsDone, meta.day, dayCompleted]);

  // 庆祝卡片自动消失
  useEffect(() => {
    if (!dayCompleted) return;
    const timer = window.setTimeout(() => {
      setDayCompleted(false);
      setCompletedDayNum(null);
    }, CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [dayCompleted]);

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

      {dayCompleted && completedDayNum != null && !planAllDone && (
        <div className="plan-day-complete card plan-day-complete-toast plan-day-complete-solid">
          <div className="plan-day-complete-head">
            <p className="plan-segment-done-title">🎉 第 {completedDayNum} 天已完成</p>
            <button
              type="button"
              className="text-link"
              aria-label="关闭"
              onClick={() => {
                setDayCompleted(false);
                setCompletedDayNum(null);
                setReflectionOpen(false);
              }}
            >
              关闭
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            {prog.total}/{prog.total} 段已读完
            {completedDayNum < meta.totalDays
              ? ` · 明天解锁第 ${completedDayNum + 1} 天`
              : ' · 计划已全部完成'}
          </p>
          <div className="plan-complete-actions" style={{ marginTop: 10 }}>
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
        </div>
      )}

      {nextStepHint && !dayCompleted && (
        <div className="plan-segment-hint card">
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            下一段：{nextStepHint}
          </p>
        </div>
      )}

      {reflectionOpen && (
        <div className="sheet-backdrop plan-reflection-backdrop" onClick={() => setReflectionOpen(false)}>
          <div className="sheet card plan-reflection-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>今日反思（可选）</strong>
              <button type="button" className="text-link" onClick={() => setReflectionOpen(false)}>关闭</button>
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
