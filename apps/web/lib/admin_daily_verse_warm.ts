import { API_BASE } from './api';
import { adminHeaders, getAdminToken } from './admin_rag';

export type DailyVerseWarmProgressKnot = { hour: number; progress: number };

export type DailyVerseWarmSettings = {
  enabled: boolean;
  t0: string;
  ramp_days: number;
  cap_min: number;
  cap_max: number;
  max_boost: number;
  cron_max_writes: number;
  manual_max_writes: number;
  catch_up_max_writes: number;
  catch_up_policy: 'per_tick_cap' | 'spread_by_remaining_slots';
  day_start_hour: number;
  day_end_hour: number;
  progress_knots: DailyVerseWarmProgressKnot[];
  cron_interval_minutes: number;
  behavior_like_only: number;
  behavior_react_only: number;
  behavior_both: number;
  backdate_min_minutes: number;
  backdate_max_minutes: number;
  use_day_spread_timestamps: boolean;
};

export type DailyVerseWarmToday = {
  verse_day: number;
  cap: number;
  real_u: number;
  synthetic_u: number;
  total_u: number;
  target_total: number;
  day_progress: number;
};

export type DailyVerseWarmStatus = {
  settings: DailyVerseWarmSettings;
  today: DailyVerseWarmToday;
};

export type DailyVerseWarmTick = {
  skipped?: string;
  mode?: string;
  personas_added?: number;
  likes_written?: number;
  reacts_written?: number;
  gap?: number;
  to_add?: number;
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!getAdminToken()) {
    throw new Error('请先登录管理后台');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...adminHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`响应异常（HTTP ${res.status}）`);
  }
  if (!res.ok) {
    const detail = (data as { detail?: string }).detail;
    throw new Error(detail || `请求失败（HTTP ${res.status}）`);
  }
  return data as T;
}

export async function fetchDailyVerseWarmStatus(): Promise<DailyVerseWarmStatus> {
  return adminFetch<DailyVerseWarmStatus>('/admin/ops/daily-verse-warm');
}

export async function patchDailyVerseWarmSettings(
  patch: Partial<DailyVerseWarmSettings>,
): Promise<DailyVerseWarmStatus> {
  return adminFetch<DailyVerseWarmStatus>('/admin/ops/daily-verse-warm', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function runDailyVerseWarmTick(
  mode: 'manual' | 'catch_up' = 'manual',
): Promise<DailyVerseWarmStatus & { tick: DailyVerseWarmTick }> {
  return adminFetch(`/admin/ops/daily-verse-warm/run?mode=${mode}`, { method: 'POST' });
}
