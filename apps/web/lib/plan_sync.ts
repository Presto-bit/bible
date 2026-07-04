// 计划进度 + 会话同步（对齐 Mobile sync_engine / 后端 registry）。

import { currentUserId } from './api';
import { enqueue, type Envelope } from './sync';
import { applyRemoteSession, sessionToSyncJson, type PlanSession } from './plan_session';
import {
  getActivePlan,
  getCachedPlanMeta,
  getCompletedPlanDays,
  getPlanDay,
  markPlanDayCompleted,
  markPlanFullyCompleted,
  setActivePlan,
  setCompletedPlanDays,
  setPlanDay,
} from './plan_progress';

export function planProgressEnvelope(
  planId: string,
  day: number,
  status: string,
  session?: PlanSession | null,
): Envelope {
  const data: Record<string, unknown> = { day, status };
  if (session) {
    data.session = sessionToSyncJson(session);
  }
  return {
    entity: 'plan_progress',
    op: 'update',
    keys: { plan_id: planId },
    client_ts: new Date().toISOString(),
    data,
  };
}

export function enqueuePlanProgress(
  planId: string,
  day: number,
  status: string,
  session?: PlanSession | null,
) {
  if (!currentUserId()) return;
  enqueue(planProgressEnvelope(planId, day, status, session));
}

/**
 * 回拉服务端进度：恢复当前天、已完成天（由 day/status 推断）、会话与进行中计划。
 * 服务端每计划仅一行，故用 day+status 推断 1..lastDone 为已完成。
 */
export function applyRemotePlanProgress(data: {
  plan_id?: string;
  day?: number;
  status?: string;
  session?: Record<string, unknown> | null;
}) {
  if (!data.plan_id) return;
  const planId = data.plan_id;
  const day = Math.max(1, data.day ?? 1);
  const status = (data.status || 'active').toLowerCase();

  if (data.session && typeof data.session === 'object') {
    applyRemoteSession(planId, day, data.session);
  }

  const lastDone = status === 'done' ? day : day - 1;
  if (lastDone > 0) {
    const local = getCompletedPlanDays(planId);
    const inferred = Array.from({ length: lastDone }, (_, i) => i + 1);
    setCompletedPlanDays(planId, [...local, ...inferred]);
  }

  const meta = getCachedPlanMeta(planId);
  const totalDays = meta?.days ?? 0;

  if (status === 'done') {
    markPlanDayCompleted(planId, day);
    if (totalDays > 0 && day >= totalDays) {
      markPlanFullyCompleted(planId);
      return;
    }
    setPlanDay(planId, Math.min(totalDays || day + 1, day + 1));
    if (meta) {
      const active = getActivePlan();
      if (!active || active.planId === planId) setActivePlan(meta);
    }
    return;
  }

  // active
  setPlanDay(planId, day);
  if (meta) {
    const active = getActivePlan();
    if (!active || active.planId === planId) setActivePlan(meta);
  }
}

/** 推送当前本地进度（登录后补齐服务端） */
export function enqueueActivePlanSnapshot(session?: PlanSession | null) {
  const active = getActivePlan();
  if (!active) return;
  const day = Math.max(1, session?.day ?? (getPlanDay(active.planId) || 1));
  const done = getCompletedPlanDays(active.planId);
  const status = done.includes(day) ? 'done' : 'active';
  enqueuePlanProgress(active.planId, day, status, session ?? null);
}
