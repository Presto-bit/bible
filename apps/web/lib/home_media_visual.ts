/** 首页成长区左媒：图标 / 风景 / 封面映射（按日稳定，卡种错开）。 */

import { bookCoverImageUrl, bookIdFromReaderHref } from './book_cover';
import { dailyVerseWallpaperUrl } from './daily_verse_wallpaper';

export type HomeMediaTone =
  | 'summary'
  | 'discover'
  | 'group'
  | 'peers'
  | 'memory'
  | 'review';

export type HomeMediaIconId =
  | 'clock'
  | 'compass'
  | 'people'
  | 'calendar'
  | 'book'
  | 'footprint'
  | 'spark';

/** 卡种风景池偏移，避免同天多卡撞同一张图（P2 扩池）。 */
const TONE_SCENE_OFFSET: Record<HomeMediaTone, number> = {
  summary: 0,
  discover: 2,
  group: 9,
  peers: 16,
  memory: 23,
  review: 5,
};

/** 同种卡第二风景候选偏移（按日奇偶切换，丰富池）。 */
const TONE_SCENE_ALT: Record<HomeMediaTone, number> = {
  summary: 11,
  discover: 18,
  group: 25,
  peers: 4,
  memory: 12,
  review: 20,
};

const TONE_ICON: Record<HomeMediaTone, HomeMediaIconId> = {
  summary: 'clock',
  discover: 'compass',
  group: 'people',
  peers: 'footprint',
  memory: 'book',
  review: 'calendar',
};

export function homeMediaDaySeed(now = new Date()): number {
  return Math.max(1, now.getDate());
}

function wallpaperIndex(seed: number, offset: number): number {
  const n = DAILY_WALLPAPER_COUNT;
  return ((Math.floor(seed) - 1 + offset) % n + n) % n;
}

const DAILY_WALLPAPER_COUNT = 31;

/** 按卡种 + 日种子取风景（同用户同天同卡稳定）。 */
export function homeMediaSceneUrl(
  tone: HomeMediaTone,
  seed = homeMediaDaySeed(),
): string {
  const alt = seed % 2 === 0 ? TONE_SCENE_ALT[tone] : TONE_SCENE_OFFSET[tone];
  const idx = wallpaperIndex(seed, alt);
  return dailyVerseWallpaperUrl(idx + 1);
}

/** 群落点：按 groupId 稳定封面（识别优先于按日轮换）。 */
export function homeMediaGroupCoverUrl(groupId: string): string {
  const h = hashString(groupId);
  return dailyVerseWallpaperUrl((h % DAILY_WALLPAPER_COUNT) + 1);
}

export function homeMediaIconForTone(tone: HomeMediaTone): HomeMediaIconId {
  return TONE_ICON[tone];
}

export function toneFromAnchorTag(
  tag: '小组' | '同行' | '发现',
): HomeMediaTone {
  if (tag === '小组') return 'group';
  if (tag === '同行') return 'peers';
  return 'discover';
}

export function groupIdFromHref(href: string): string | null {
  const m = href.match(/\/discover\/group\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** 记忆卡：能解析书卷则用书卷封面，否则按日风景。 */
export function homeMediaMemoryImageUrl(
  href: string,
  tone: HomeMediaTone = 'memory',
  seed = homeMediaDaySeed(),
): string {
  const parsed = bookIdFromReaderHref(href);
  if (parsed?.bookId) return bookCoverImageUrl(parsed.bookId);
  return homeMediaSceneUrl(tone, seed);
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
