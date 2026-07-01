// 计划进度 + 会话同步（对齐 Mobile sync_engine / 后端 registry）。

import { currentUserId } from './api';
import { enqueue, type Envelope } from './sync';
import { applyRemoteSession, sessionToSyncJson, type PlanSession } from './plan_session';

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

export function applyRemotePlanProgress(data: {
  plan_id?: string;
  day?: number;
  status?: string;
  session?: Record<string, unknown> | null;
}) {
  if (!data.plan_id) return;
  const day = data.day ?? 1;
  if (data.session && typeof data.session === 'object') {
    applyRemoteSession(data.plan_id, day, data.session);
  }
}
