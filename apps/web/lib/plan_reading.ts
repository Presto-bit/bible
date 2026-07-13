// 计划阅读编排：加载今日 Steps、启动会话、跳转阅读器。

import { api } from './api';
import {
  getActivePlan,
  getPlanDay,
  setActivePlan,
  setPlanDay,
  type ActivePlan,
} from './plan_progress';
import {
  applyRemoteSession,
  getPlanSession,
  startPlanSession,
  type PlanSession,
} from './plan_session';
import {
  stepsForGeneratedDay,
  stepsForReadingRows,
  type GeneratedDayRow,
  type PlanStep,
  type ReadingDayRow,
} from './plan_steps';
import { loadGeneratedPlans } from './generated_plans';

export interface PlanReadingMeta {
  planId: string;
  planTitle: string;
  day: number;
  totalDays: number;
  steps: PlanStep[];
  session: PlanSession;
  source: 'featured' | 'generated';
}

export async function loadStepsForDay(
  plan: ActivePlan,
  day: number,
): Promise<PlanStep[]> {
  if (plan.source === 'generated') {
    const list = loadGeneratedPlans() as Array<{ id: string; days: GeneratedDayRow[] }>;
    const found = list.find((p) => p.id === plan.planId);
    const dayRow = found?.days.find((d) => d.day === day);
    return dayRow ? stepsForGeneratedDay(dayRow) : [];
  }
  const detail = await api.planDetail(plan.planId);
  const rows = (detail.days ?? []) as ReadingDayRow[];
  return stepsForReadingRows(rows, day);
}

export async function buildPlanReadingMeta(
  plan: ActivePlan,
  day?: number,
): Promise<PlanReadingMeta | null> {
  const d = day ?? (getPlanDay(plan.planId) || 1);
  const steps = await loadStepsForDay(plan, d);
  if (!steps.length) return null;
  const session = startPlanSession(plan.planId, d);
  return {
    planId: plan.planId,
    planTitle: plan.title,
    day: d,
    totalDays: plan.days,
    steps,
    session,
    source: plan.source,
  };
}

export function readerHref(meta: PlanReadingMeta, stepIndex?: number, groupId?: string): string {
  const idx = stepIndex ?? meta.session.currentStepIndex;
  const step = meta.steps[idx] ?? meta.steps[0];
  const params = new URLSearchParams({
    book: step.bookId,
    chapter: String(step.chapterStart),
    plan: meta.planId,
    day: String(meta.day),
  });
  if (groupId) params.set('group', groupId);
  return `/reader?${params.toString()}`;
}

export function resumeStepIndex(meta: PlanReadingMeta): number {
  const { session, steps } = meta;
  if (session.currentStepIndex >= 0 && session.currentStepIndex < steps.length) {
    return session.currentStepIndex;
  }
  const firstPending = steps.findIndex((s) => !session.stepsDone.includes(s.id));
  return firstPending >= 0 ? firstPending : 0;
}

export async function hydratePlanFromUrl(
  planId: string,
  day: number,
): Promise<PlanReadingMeta | null> {
  const active = getActivePlan();
  if (active && active.planId === planId) {
    return buildPlanReadingMeta(active, day);
  }
  try {
    const generated = loadGeneratedPlans();
    const saved = generated.find((p) => p.id === planId);
    if (saved) {
      const plan: ActivePlan = {
        planId: saved.id,
        title: saved.title,
        kind: 'reading',
        days: saved.days_count,
        source: 'generated',
      };
      setActivePlan(plan);
      setPlanDay(planId, day);
      return buildPlanReadingMeta(plan, day);
    }
    const plans = await api.plans();
    const p = plans.plans.find((x) => x.plan_id === planId);
    if (p) {
      const plan: ActivePlan = {
        planId: p.plan_id,
        title: p.title,
        kind: p.type === 'prayer' ? 'prayer' : 'reading',
        days: p.days,
        source: 'featured',
      };
      setActivePlan(plan);
      setPlanDay(planId, day);
      return buildPlanReadingMeta(plan, day);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export { applyRemoteSession, getPlanSession };
