/** 首页今日推荐活动卡缓存：避免每次切回首页先闪「继续阅读」再换成活动主卡 */

import type { HomeTodayCampaignInput } from '@/lib/home_today_panel';

const KEY = 'home_campaigns_cache_v1';

export function readCachedHomeCampaigns(): HomeTodayCampaignInput[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((c): c is HomeTodayCampaignInput => Boolean(c && typeof c === 'object' && (c as HomeTodayCampaignInput).id))
      .slice(0, 3)
      .map((c) => ({
        id: String(c.id),
        tag: String(c.tag || '活动'),
        title: String(c.title || ''),
        sub: String(c.sub || ''),
        href: String(c.href || ''),
        bookId: c.bookId ? String(c.bookId) : undefined,
        coverUrl: c.coverUrl ? String(c.coverUrl) : undefined,
      }));
  } catch {
    return null;
  }
}

export function writeCachedHomeCampaigns(campaigns: HomeTodayCampaignInput[]): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(campaigns.slice(0, 3)));
  } catch {
    /* quota / private mode */
  }
}

export function clearCachedHomeCampaigns(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
