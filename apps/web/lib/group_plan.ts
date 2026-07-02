import { api } from './api';
import {
  getActivePlan,
  getPlanDay,
  setActivePlan,
  setPlanDay,
  type ActivePlan,
} from './plan_progress';

export function isOnGroupPlan(planId: string): boolean {
  return getActivePlan()?.planId === planId;
}

export async function adoptGroupPlan(
  planId: string,
  initialDay?: number,
): Promise<ActivePlan | null> {
  const { plans } = await api.plans();
  const p = plans.find((x) => x.plan_id === planId);
  if (!p) return null;
  const plan: ActivePlan = {
    planId: p.plan_id,
    title: p.title,
    kind: p.type === 'prayer' ? 'prayer' : 'reading',
    days: p.days,
    source: 'featured',
  };
  setActivePlan(plan);
  if (initialDay && initialDay > 0) {
    setPlanDay(planId, initialDay);
  }
  return plan;
}

export function groupPlanReaderHref(planId: string, day?: number, groupId?: string): string {
  const d = day ?? (getPlanDay(planId) || 1);
  const params = new URLSearchParams({
    plan: planId,
    day: String(d),
  });
  if (groupId) params.set('group', groupId);
  return `/reader?${params.toString()}`;
}

export function groupPlanProgressLabel(g: {
  plan_day_avg?: number;
  plan_days_total?: number;
  my_plan_day?: number;
  members_on_plan?: number;
  members?: number;
}): string {
  const total = g.plan_days_total ?? 0;
  if (total <= 0) return '';
  const avg = g.plan_day_avg ?? 0;
  const mine = g.my_plan_day ?? 0;
  const on = g.members_on_plan ?? 0;
  const mem = g.members ?? 0;
  const minePart = mine > 0 ? ` · 我第 ${mine} 天` : '';
  return `集体均第 ${avg}/${total} 天 · ${on}/${mem} 人在读${minePart}`;
}
