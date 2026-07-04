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
const SKIPPED_DAYS_KEY = 'presto_plan_skipped_days';
const COMPLETED_PLANS_KEY = 'presto_completed_plans';
const PLAN_META_KEY = 'presto_plan_meta_cache';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function cachePlanMeta(plan: ActivePlan) {
  const map = readJson<Record<string, ActivePlan>>(PLAN_META_KEY, {});
  map[plan.planId] = plan;
  writeJson(PLAN_META_KEY, map);
}

export function getCachedPlanMeta(planId: string): ActivePlan | null {
  const map = readJson<Record<string, ActivePlan>>(PLAN_META_KEY, {});
  return map[planId] ?? null;
}

export function getActivePlan(): ActivePlan | null {
  return readJson<ActivePlan | null>(ACTIVE_KEY, null);
}

export function setActivePlan(plan: ActivePlan) {
  writeJson(ACTIVE_KEY, plan);
  cachePlanMeta(plan);
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
  writeJson(DAY_KEY, map);
}

export function advancePlanDay(planId: string, maxDays: number) {
  const cur = getPlanDay(planId);
  setPlanDay(planId, Math.min(maxDays, cur + 1));
}

export function getCompletedPlanDays(planId: string): number[] {
  const map = readJson<Record<string, number[]>>(DONE_DAYS_KEY, {});
  return map[planId] ?? [];
}

export function setCompletedPlanDays(planId: string, days: number[]) {
  const map = readJson<Record<string, number[]>>(DONE_DAYS_KEY, {});
  map[planId] = [...new Set(days)].filter((d) => d > 0).sort((a, b) => a - b);
  writeJson(DONE_DAYS_KEY, map);
}

export function markPlanDayCompleted(planId: string, day: number) {
  const set = new Set(getCompletedPlanDays(planId));
  set.add(day);
  setCompletedPlanDays(planId, Array.from(set));
  // 完成则清除同日「跳过」标记
  const skipped = new Set(getSkippedPlanDays(planId));
  if (skipped.delete(day)) {
    setSkippedPlanDays(planId, Array.from(skipped));
  }
}

export function getSkippedPlanDays(planId: string): number[] {
  const map = readJson<Record<string, number[]>>(SKIPPED_DAYS_KEY, {});
  return map[planId] ?? [];
}

export function setSkippedPlanDays(planId: string, days: number[]) {
  const map = readJson<Record<string, number[]>>(SKIPPED_DAYS_KEY, {});
  map[planId] = [...new Set(days)].filter((d) => d > 0).sort((a, b) => a - b);
  writeJson(SKIPPED_DAYS_KEY, map);
}

export function isPlanDaySkipped(planId: string, day: number): boolean {
  return getSkippedPlanDays(planId).includes(day);
}

/** 跳过今天：不计入完成，但解锁下一天 */
export function skipPlanDay(planId: string, day: number, maxDays: number) {
  if (isPlanDayCompleted(planId, day)) return;
  const skipped = new Set(getSkippedPlanDays(planId));
  skipped.add(day);
  setSkippedPlanDays(planId, Array.from(skipped));
  const cur = getPlanDay(planId) || 1;
  if (cur <= day) {
    setPlanDay(planId, Math.min(maxDays, day + 1));
  }
}

export function isPlanDayUnlocked(planId: string, day: number): boolean {
  if (day <= 1) return true;
  if (getCompletedPlanDays(planId).includes(day - 1)) return true;
  if (isPlanDaySkipped(planId, day - 1)) return true;
  // 补读昨天：当前进度天的前一天始终可进
  const current = getPlanDay(planId) || 1;
  if (day === current - 1 && !isPlanDayCompleted(planId, day) && !isPlanDaySkipped(planId, day)) {
    return true;
  }
  return false;
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

export function markPlanFullyCompleted(planId: string) {
  const list = getCompletedPlanIds();
  if (!list.includes(planId)) {
    writeJson(COMPLETED_PLANS_KEY, [...list, planId]);
  }
  const active = getActivePlan();
  if (active?.planId === planId) cancelActivePlan();
}

/** 全部天读完时自动归档并清除进行中计划 */
export function tryAutoCompletePlan(planId: string, totalDays: number): boolean {
  if (!isPlanFullyCompleted(planId, totalDays)) return false;
  markPlanFullyCompleted(planId);
  return true;
}

/** 连续完成天数（从最近完成日往前数） */
export function planCompletionStreak(planId: string): number {
  const done = new Set(getCompletedPlanDays(planId));
  if (done.size === 0) return 0;
  const maxDone = Math.max(...done);
  let streak = 0;
  for (let d = maxDone; d >= 1; d -= 1) {
    if (done.has(d)) streak += 1;
    else break;
  }
  return streak;
}

/** 重新开始已完成的计划（保留历史完成记录，重置进度）。 */
export function restartPlan(planId: string) {
  const map = readJson<Record<string, number[]>>(DONE_DAYS_KEY, {});
  delete map[planId];
  writeJson(DONE_DAYS_KEY, map);
  const skipped = readJson<Record<string, number[]>>(SKIPPED_DAYS_KEY, {});
  delete skipped[planId];
  writeJson(SKIPPED_DAYS_KEY, skipped);
  const completed = getCompletedPlanIds().filter((id) => id !== planId);
  writeJson(COMPLETED_PLANS_KEY, completed);
  setPlanDay(planId, 1);
}
