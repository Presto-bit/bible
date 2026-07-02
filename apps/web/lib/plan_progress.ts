// 进行中计划：本地存储进度与当前执行计划。

export type PlanKind = 'reading' | 'prayer';

export interface ActivePlan {
  planId: string;
  title: string;
  kind: PlanKind;
  days: number;
  source: 'featured' | 'generated';
}

const ACTIVE_KEY = 'presto_active_plan';
const DAY_KEY = 'presto_plan_day';
const DONE_DAYS_KEY = 'presto_plan_done_days';
const COMPLETED_PLANS_KEY = 'presto_completed_plans';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export function getActivePlan(): ActivePlan | null {
  return readJson<ActivePlan | null>(ACTIVE_KEY, null);
}

export function setActivePlan(plan: ActivePlan) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(plan));
}

export function cancelActivePlan() {
  localStorage.removeItem(ACTIVE_KEY);
}

export function getPlanDay(planId: string): number {
  const map = readJson<Record<string, number>>(DAY_KEY, {});
  return map[planId] ?? 0;
}

export function setPlanDay(planId: string, day: number) {
  const map = readJson<Record<string, number>>(DAY_KEY, {});
  map[planId] = day;
  localStorage.setItem(DAY_KEY, JSON.stringify(map));
}

export function advancePlanDay(planId: string, maxDays: number) {
  const cur = getPlanDay(planId);
  setPlanDay(planId, Math.min(maxDays, cur + 1));
}

export function getCompletedPlanDays(planId: string): number[] {
  const map = readJson<Record<string, number[]>>(DONE_DAYS_KEY, {});
  return map[planId] ?? [];
}

export function markPlanDayCompleted(planId: string, day: number) {
  const map = readJson<Record<string, number[]>>(DONE_DAYS_KEY, {});
  const set = new Set(map[planId] ?? []);
  set.add(day);
  map[planId] = Array.from(set).sort((a, b) => a - b);
  localStorage.setItem(DONE_DAYS_KEY, JSON.stringify(map));
}

export function isPlanDayUnlocked(planId: string, day: number): boolean {
  if (day <= 1) return true;
  return getCompletedPlanDays(planId).includes(day - 1);
}

export function isPlanDayCompleted(planId: string, day: number): boolean {
  return getCompletedPlanDays(planId).includes(day);
}

export function isPlanFullyCompleted(planId: string, totalDays: number): boolean {
  if (totalDays <= 0) return false;
  const done = new Set(getCompletedPlanDays(planId));
  for (let d = 1; d <= totalDays; d += 1) {
    if (!done.has(d)) return false;
  }
  return true;
}

export function getCompletedPlanIds(): string[] {
  return readJson<string[]>(COMPLETED_PLANS_KEY, []);
}

/** 全部天读完时自动归档并清除进行中计划 */
export function tryAutoCompletePlan(planId: string, totalDays: number): boolean {
  if (!isPlanFullyCompleted(planId, totalDays)) return false;
  const list = getCompletedPlanIds();
  if (!list.includes(planId)) {
    localStorage.setItem(COMPLETED_PLANS_KEY, JSON.stringify([...list, planId]));
  }
  const active = getActivePlan();
  if (active?.planId === planId) cancelActivePlan();
  return true;
}
