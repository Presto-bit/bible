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
