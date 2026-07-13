import { userLsGet, userLsSet, userLsRemove } from './user_storage';
/** 计划日反思（本地记录，可选同步为笔记）。 */

const KEY = 'presto_plan_reflections';

export interface PlanReflection {
  planId: string;
  day: number;
  body: string;
  updatedAt: number;
}

function readAll(): Record<string, PlanReflection> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(userLsGet(KEY) || '{}') as Record<string, PlanReflection>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, PlanReflection>) {
  userLsSet(KEY, JSON.stringify(map));
}

function key(planId: string, day: number) {
  return `${planId}:${day}`;
}

export function getPlanReflection(planId: string, day: number): PlanReflection | null {
  return readAll()[key(planId, day)] ?? null;
}

export function savePlanReflection(planId: string, day: number, body: string) {
  const map = readAll();
  map[key(planId, day)] = {
    planId,
    day,
    body: body.trim(),
    updatedAt: Date.now(),
  };
  writeAll(map);
}
