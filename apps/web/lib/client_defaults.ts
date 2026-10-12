/** 拉取后端 /content/client-defaults，缓存内存，供 Web/壳对齐默认规则。 */

import { API_BASE } from './api_core';

export type ClientDefaults = {
  version: number;
  reminders: {
    daily_reading_enabled_default: boolean;
    reading_dnd_default: boolean;
  };
  home: {
    rail_slot_min: number;
    rail_slot_max: number;
    warm_excluded_from_uv: boolean;
  };
  discover: {
    tab_bar_unread_badge: boolean;
  };
  copy: {
    guilt_free: boolean;
    reminder_body_hint: string;
  };
};

let cached: ClientDefaults | null = null;
let inflight: Promise<ClientDefaults | null> | null = null;

const FALLBACK: ClientDefaults = {
  version: 0,
  reminders: {
    daily_reading_enabled_default: false,
    reading_dnd_default: true,
  },
  home: { rail_slot_min: 1, rail_slot_max: 4, warm_excluded_from_uv: true },
  discover: { tab_bar_unread_badge: false },
  copy: {
    guilt_free: true,
    reminder_body_hint: '愿话语成为你脚前的灯 · 今日也可打开圣经读一章',
  },
};

export function clientDefaultsFallback(): ClientDefaults {
  return FALLBACK;
}

export async function fetchClientDefaults(): Promise<ClientDefaults> {
  if (cached) return cached;
  if (inflight) {
    const hit = await inflight;
    return hit || FALLBACK;
  }
  inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/content/client-defaults`, {
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as ClientDefaults;
      cached = data;
      return data;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  const data = await inflight;
  return data || FALLBACK;
}
