/** 首页 / 每日经文域 API（窄依赖 api_core）。 */

import { chinaTodayYmd } from '../daily_clock';
import {
  getJson,
  authed,
  authHeaders,
  type DailyVerse,
  type DailyVerseReactPreset,
  type DailyVerseReactTopPreset,
  type DailyVerseReactResult,
  type DailyVerseReactFeed,
  type DailyDevotional,
  type HomeBootstrap,
  type PrayerToday,
} from '../api_core';

export type {
  DailyVerse,
  DailyVerseReactPreset,
  DailyVerseReactTopPreset,
  DailyVerseReactResult,
  DailyVerseReactFeed,
  DailyDevotional,
  HomeBootstrap,
  PrayerToday,
};

export const homeApi = {
  homeBootstrap: (previewCampaignId?: string) => {
    const q = new URLSearchParams();
    q.set('_d', chinaTodayYmd());
    if (previewCampaignId) q.set('preview_campaign_id', previewCampaignId);
    const headers: Record<string, string> = { ...authHeaders() };
    return getJson<HomeBootstrap>(`/content/home/bootstrap?${q}`, headers, {
      timeoutMs: 8_000,
    });
  },
  dailyVerse: (day?: number) => {
    const q = new URLSearchParams();
    if (day != null) q.set('day', String(day));
    else q.set('_d', chinaTodayYmd());
    return getJson<DailyVerse>(`/content/daily-verse?${q}`, authHeaders());
  },
  toggleDailyVerseLike: (day?: number) =>
    authed<{ liked: boolean; likes_count: number; shares_count: number }>(
      `/content/daily-verse/like${day != null ? `?day=${day}` : ''}`,
      { method: 'POST' },
    ),
  recordDailyVerseShare: (day?: number) =>
    authed<{ ok: boolean; likes_count: number; shares_count: number }>(
      `/content/daily-verse/share${day != null ? `?day=${day}` : ''}`,
      { method: 'POST' },
    ),
  dailyVerseReactPresets: () =>
    getJson<{ emojis: DailyVerseReactPreset[]; phrases: DailyVerseReactPreset[] }>(
      '/content/daily-verse/react-presets',
    ),
  upsertDailyVerseReact: (presetId: string, day?: number) =>
    authed<DailyVerseReactResult>(
      `/content/daily-verse/react${day != null ? `?day=${day}` : ''}`,
      { method: 'POST', body: { preset_id: presetId } },
    ),
  dailyVerseReacts: (day?: number, limit = 40) => {
    const q = new URLSearchParams();
    if (day != null) q.set('day', String(day));
    q.set('limit', String(limit));
    return getJson<DailyVerseReactFeed>(`/content/daily-verse/reacts?${q}`, authHeaders());
  },
  dailyDevotional: () =>
    getJson<DailyDevotional>(`/content/daily-devotional?_d=${chinaTodayYmd()}`),
  analyticsVisit: () =>
    authed<{ ok: boolean; day: string; error?: string | null }>('/content/uv-visit', {
      method: 'POST',
    }),
  prayerToday: (planId?: string, day?: number) => {
    const q = new URLSearchParams();
    if (planId) q.set('plan_id', planId);
    if (day != null) q.set('day', String(day));
    const qs = q.toString();
    return getJson<PrayerToday>(`/content/prayer-today${qs ? `?${qs}` : ''}`);
  },
};
