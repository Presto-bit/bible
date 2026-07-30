/** 首页今日推荐活动卡缓存：localStorage + TTL，跨会话避免先闪续读卡 */

import type { HomeTodayCampaignInput } from '@/lib/home_today_panel';

const KEY = 'home_campaigns_cache_v2';
/** 6 小时：覆盖日常回访；过期仍可读作 stale 首屏，网络回来再覆盖 */
export const HOME_CAMPAIGNS_TTL_MS = 6 * 60 * 60 * 1000;

type CachePayload = {
  savedAt: number;
  campaigns: HomeTodayCampaignInput[];
};

function normalizeList(parsed: unknown): HomeTodayCampaignInput[] | null {
  if (!Array.isArray(parsed)) return null;
  return parsed
    .filter((c): c is HomeTodayCampaignInput =>
      Boolean(c && typeof c === 'object' && (c as HomeTodayCampaignInput).id),
    )
    .slice(0, 3)
    .map((c) => ({
      id: String(c.id),
      tag: (() => {
        const t = String(c.tag || '活动').trim();
        if (!t || t === '空白' || t === '空白页' || t === '未命名') return '活动';
        return t.slice(0, 8);
      })(),
      title: String(c.title || ''),
      sub: String(c.sub || ''),
      href: String(c.href || ''),
      bookId: c.bookId ? String(c.bookId) : undefined,
      coverUrl: c.coverUrl ? String(c.coverUrl) : undefined,
    }));
}

export function readCachedHomeCampaigns(opts?: {
  /** 为 true 时过期也返回（仅作首屏占位） */
  allowStale?: boolean;
}): HomeTodayCampaignInput[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY) || sessionStorage.getItem('home_campaigns_cache_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    // v1：纯数组
    if (Array.isArray(parsed)) {
      const list = normalizeList(parsed);
      return list;
    }
    const payload = parsed as CachePayload;
    const list = normalizeList(payload?.campaigns);
    if (!list) return null;
    const savedAt = Number(payload.savedAt) || 0;
    const fresh = savedAt > 0 && Date.now() - savedAt < HOME_CAMPAIGNS_TTL_MS;
    if (fresh || opts?.allowStale) return list;
    return null;
  } catch {
    return null;
  }
}

export function writeCachedHomeCampaigns(campaigns: HomeTodayCampaignInput[]): void {
  if (typeof window === 'undefined') return;
  const payload: CachePayload = {
    savedAt: Date.now(),
    campaigns: campaigns.slice(0, 3),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
  try {
    sessionStorage.removeItem('home_campaigns_cache_v1');
  } catch {
    /* ignore */
  }
}

export function clearCachedHomeCampaigns(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem('home_campaigns_cache_v1');
  } catch {
    /* ignore */
  }
}

function normalizeHomeRailTag(tag: string | undefined | null): string {
  const t = (tag || '').trim();
  if (!t || t === '空白' || t === '空白页' || t === '未命名') return '活动';
  return t.slice(0, 8);
}

/** 把 bootstrap / homeCampaigns API 行映射为今日推荐输入 */
export function mapApiCampaignsToHomeInput(
  rows: Array<{
    id: string;
    name: string;
    tag?: string;
    subtitle?: string;
    href?: string;
    coverUrl?: string | null;
  }>,
): HomeTodayCampaignInput[] {
  return rows.slice(0, 3).map((c) => ({
    id: c.id,
    tag: normalizeHomeRailTag(c.tag),
    title: c.name,
    sub: (c.subtitle || '').trim() || '进入活动',
    href: c.href || `/campaigns/view/${c.id}`,
    coverUrl: c.coverUrl || undefined,
  }));
}
