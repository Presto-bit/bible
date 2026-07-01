// 计划阅读会话：段进度、断点（localStorage + 随 plan_progress 同步）。

import type { PlanStep } from './plan_steps';
import { nextIncompleteStep } from './plan_steps';

export interface PlanSession {
  planId: string;
  day: number;
  currentStepIndex: number;
  stepsDone: string[];
  lastRef?: string;
  updatedAt: number;
}

const SESSION_KEY = 'presto_plan_sessions';

function readAll(): Record<string, PlanSession> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}') as Record<string, PlanSession>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, PlanSession>) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(map));
}

function key(planId: string, day: number) {
  return `${planId}:${day}`;
}

export function getPlanSession(planId: string, day: number): PlanSession | null {
  return readAll()[key(planId, day)] ?? null;
}

export function savePlanSession(session: PlanSession) {
  const map = readAll();
  map[key(session.planId, session.day)] = {
    ...session,
    updatedAt: Date.now(),
  };
  writeAll(map);
}

export function clearPlanSession(planId: string, day: number) {
  const map = readAll();
  delete map[key(planId, day)];
  writeAll(map);
}

export function startPlanSession(planId: string, day: number): PlanSession {
  const existing = getPlanSession(planId, day);
  if (existing) return existing;
  const session: PlanSession = {
    planId,
    day,
    currentStepIndex: 0,
    stepsDone: [],
    updatedAt: Date.now(),
  };
  savePlanSession(session);
  return session;
}

export function markStepDone(session: PlanSession, stepId: string, steps: PlanStep[]): PlanSession {
  const stepsDone = session.stepsDone.includes(stepId)
    ? session.stepsDone
    : [...session.stepsDone, stepId];
  const next = nextIncompleteStep(steps, stepsDone);
  const nextIndex = next ? steps.findIndex((s) => s.id === next.id) : steps.length - 1;
  const updated: PlanSession = {
    ...session,
    stepsDone,
    currentStepIndex: Math.max(0, nextIndex),
    updatedAt: Date.now(),
  };
  savePlanSession(updated);
  return updated;
}

export function updateSessionRef(session: PlanSession, ref: string): PlanSession {
  const updated = { ...session, lastRef: ref, updatedAt: Date.now() };
  savePlanSession(updated);
  return updated;
}

export function applyRemoteSession(
  planId: string,
  day: number,
  raw: Record<string, unknown>,
): PlanSession {
  const session: PlanSession = {
    planId,
    day,
    currentStepIndex: (raw.currentStepIndex as number) ?? 0,
    stepsDone: ((raw.stepsDone as string[]) ?? []).slice(),
    lastRef: raw.lastRef as string | undefined,
    updatedAt: (raw.updatedAt as number) ?? Date.now(),
  };
  savePlanSession(session);
  return session;
}

export function sessionToSyncJson(session: PlanSession): Record<string, unknown> {
  return {
    day: session.day,
    currentStepIndex: session.currentStepIndex,
    stepsDone: session.stepsDone,
    lastRef: session.lastRef ?? null,
    updatedAt: session.updatedAt,
  };
}
