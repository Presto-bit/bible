/**
 * 首页「活感」会话态：断签、计划完成、打卡回流、入场一次。
 */

import { getReadingLogMap, readEvents, todayMinutes } from './reading';

const PLAN_DONE_PREFIX = 'presto_home_plan_done_';
const CHECKIN_FLASH_KEY = 'presto_home_checkin_flash';
const STAGGER_KEY = 'presto_home_stagger_once';
const PLAN_HAPTIC_KEY = 'presto_home_plan_done_haptic';

function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 距上次有效阅读的整天数；无历史返回 null */
export function daysSinceLastActiveReading(now = new Date()): number | null {
  let lastTs = 0;
  for (const e of readEvents()) {
    if (e.ts > lastTs) lastTs = e.ts;
  }
  const logs = getReadingLogMap();
  for (const [day, log] of Object.entries(logs)) {
    if (!log || ((log.minutes || 0) <= 0 && (log.chapters || 0) <= 0)) continue;
    const parts = day.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) continue;
    const ts = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    if (ts > lastTs) lastTs = ts;
  }
  if (!lastTs) return null;
  const diff = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(new Date(lastTs))) / 86_400_000,
  );
  return Math.max(0, diff);
}

/** ≥3 天未读 → 欢迎回来 */
export function isWelcomeBackGap(now = new Date()): boolean {
  const days = daysSinceLastActiveReading(now);
  return days != null && days >= 3;
}

export function todayHasReadingActivity(): boolean {
  return todayMinutes() > 0;
}

export function markPlanDayDoneToday() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`${PLAN_DONE_PREFIX}${ymd()}`, '1');
  } catch {
    /* ignore */
  }
}

export function isPlanDayDoneToday(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(`${PLAN_DONE_PREFIX}${ymd()}`) === '1';
  } catch {
    return false;
  }
}

/** 计划完成回首页：每会话最多成功触觉 1 次 */
export function consumePlanDoneHomeHaptic(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    if (sessionStorage.getItem(PLAN_HAPTIC_KEY) === '1') return false;
    sessionStorage.setItem(PLAN_HAPTIC_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function markCheckinFlash() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CHECKIN_FLASH_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** 若在窗口内则消费并返回 true */
export function consumeCheckinFlash(windowMs = 12_000): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(CHECKIN_FLASH_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(CHECKIN_FLASH_KEY);
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts <= windowMs;
  } catch {
    return false;
  }
}

/** 每会话首页错落入场一次 */
export function shouldPlayHomeStagger(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    if (sessionStorage.getItem(STAGGER_KEY) === '1') return false;
    sessionStorage.setItem(STAGGER_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
