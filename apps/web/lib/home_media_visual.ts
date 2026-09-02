/** 首页成长区左媒：图标 / 风景 / 封面映射（按卡种固定，不随日轮换）。 */

import { bookCoverImageUrl, bookIdFromReaderHref } from './book_cover';
import { dailyVerseWallpaperUrl } from './daily_verse_wallpaper';

export type HomeMediaTone =
  | 'summary'
  | 'discover'
  | 'group'
  | 'peers'
  | 'memory'
  | 'review'
  | 'plan'
  | 'prayer'
  | 'theme';

export type HomeMediaIconId =
  | 'clock'
  | 'compass'
  | 'people'
  | 'calendar'
  | 'book'
  | 'footprint'
  | 'spark'
  | 'prayer';

/** 卡种固定风景下标（1-based），长期不变。 */
const TONE_SCENE_DAY: Record<HomeMediaTone, number> = {
  summary: 1,
  discover: 3,
  group: 10,
  peers: 17,
  memory: 24,
  review: 6,
  plan: 8,
  prayer: 14,
  theme: 21,
};

const TONE_ICON: Record<HomeMediaTone, HomeMediaIconId> = {
  summary: 'clock',
  discover: 'compass',
  group: 'people',
  peers: 'footprint',
  memory: 'book',
  review: 'calendar',
  plan: 'calendar',
  prayer: 'prayer',
  theme: 'compass',
};

const DAILY_WALLPAPER_COUNT = 31;

/** 按卡种取固定风景（同卡种始终同一张）。 */
export function homeMediaSceneUrl(tone: HomeMediaTone): string {
  const day = ((TONE_SCENE_DAY[tone] - 1) % DAILY_WALLPAPER_COUNT) + 1;
  return dailyVerseWallpaperUrl(day);
}

/** 群落点：按 groupId 稳定封面。 */
export function homeMediaGroupCoverUrl(groupId: string): string {
  const h = hashString(groupId);
  return dailyVerseWallpaperUrl((h % DAILY_WALLPAPER_COUNT) + 1);
}

export function homeMediaIconForTone(tone: HomeMediaTone): HomeMediaIconId {
  return TONE_ICON[tone];
}

export function toneFromAnchorTag(
  tag: '小组' | '同行' | '消息',
): HomeMediaTone {
  if (tag === '小组') return 'group';
  if (tag === '同行') return 'peers';
  return 'discover';
}

export function groupIdFromHref(href: string): string | null {
  const m = href.match(/\/discover\/group\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** 记忆卡：能解析书卷则用书卷封面，否则用固定卡种风景。 */
export function homeMediaMemoryImageUrl(
  href: string,
  tone: HomeMediaTone = 'memory',
): string {
  const parsed = bookIdFromReaderHref(href);
  if (parsed?.bookId) return bookCoverImageUrl(parsed.bookId);
  return homeMediaSceneUrl(tone);
}

/** 本月阅读进度：已读天数 / 当月天数。 */
export function homeMediaMonthProgressPct(
  monthDays: number,
  now = new Date(),
): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (daysInMonth <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((monthDays / daysInMonth) * 100)));
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
