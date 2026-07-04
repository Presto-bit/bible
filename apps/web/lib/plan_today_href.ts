/** 进行中计划 → 今日执行深链 */

import { buildPlanReadingMeta, readerHref, resumeStepIndex } from './plan_reading';
import { getActivePlan, getPlanDay, type ActivePlan } from './plan_progress';
import { getPlanSession } from './plan_session';

/** 祷告计划：打开计划页并自动拉起今日 Sheet（由 plans 页读 query） */
export function prayerTodayHref(plan?: ActivePlan | null): string {
  const active = plan ?? getActivePlan();
  if (!active || active.kind !== 'prayer') return '/plans?tab=prayer';
  const day = getPlanDay(active.planId) || 1;
  return `/plans?tab=prayer&open=${encodeURIComponent(active.planId)}&day=${day}`;
}

/** 读经计划：直达今日阅读器 */
export async function readingTodayHref(plan?: ActivePlan | null): Promise<string | null> {
  const active = plan ?? getActivePlan();
  if (!active || active.kind === 'prayer') return null;
  const day = getPlanDay(active.planId) || 1;
  const meta = await buildPlanReadingMeta(active, day);
  if (!meta) return `/plans`;
  const sess = getPlanSession(active.planId, day) ?? meta.session;
  const fullMeta = { ...meta, session: sess };
  return readerHref(fullMeta, resumeStepIndex(fullMeta));
}

/** 同步可用的今日入口（祷告立即返回；读经需 async） */
export function activePlanTodayHrefSync(plan?: ActivePlan | null): string {
  const active = plan ?? getActivePlan();
  if (!active) return '/plans';
  if (active.kind === 'prayer') return prayerTodayHref(active);
  const day = getPlanDay(active.planId) || 1;
  return `/plans?open=${encodeURIComponent(active.planId)}&day=${day}`;
}
