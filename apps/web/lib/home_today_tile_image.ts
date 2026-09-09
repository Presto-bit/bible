/** 今日推荐 2×2 上图区：坑位固定摄影（不随续读书卷换书封） */

import { clientAssetUrl } from './basePath';
import { resolveCampaignCoverUrl } from './daily_verse_wallpaper';
import type { HomeTodayPanelSlot } from './home_today_panel';

export type HomeTodayTileKind =
  | 'activity'
  | 'shelf'
  | 'read'
  | 'fellowship'
  | 'prayer';

const HOME_TILES: Record<HomeTodayTileKind, string> = {
  read: '/illustrations/home/tile_read.jpg',
  fellowship: '/illustrations/home/tile_fellowship.jpg',
  prayer: '/illustrations/home/tile_prayer.jpg',
  activity: '/illustrations/home/tile_activity.jpg',
  shelf: '/illustrations/home/tile_shelf.jpg',
};

const HOME_GROWTH_PATHS = [
  '/illustrations/home/growth_summary.jpg',
  '/illustrations/home/growth_plan.jpg',
  '/illustrations/home/growth_theme.jpg',
  '/illustrations/home/growth_prayer.jpg',
] as const;

/** 每日经文 Hero 按 day 轮换（与今日推荐/成长区同源本地插图，SW 可预缓存） */
const HERO_ILLUSTRATION_FILES = [
  'tile_read.jpg',
  'tile_fellowship.jpg',
  'tile_prayer.jpg',
  'tile_activity.jpg',
  'tile_shelf.jpg',
  'growth_summary.jpg',
  'growth_plan.jpg',
  'growth_theme.jpg',
  'growth_prayer.jpg',
] as const;

export function homeHeroIllustrationFile(day?: number): string {
  const d = Math.max(1, Math.floor(day ?? 1) || 1);
  return HERO_ILLUSTRATION_FILES[(d - 1) % HERO_ILLUSTRATION_FILES.length];
}

export function homeHeroIllustrationUrl(day?: number): string {
  return clientAssetUrl(`/illustrations/home/${homeHeroIllustrationFile(day)}`);
}

/** 预取用：今日推荐 + 成长区 + Hero 插图绝对 URL */
export function homeTodayTileWarmUrls(): string[] {
  const paths = [
    ...Object.values(HOME_TILES),
    ...HOME_GROWTH_PATHS,
    ...HERO_ILLUSTRATION_FILES.map((f) => `/illustrations/home/${f}`),
  ];
  return [...new Set(paths.map((p) => clientAssetUrl(p)))];
}

/** 64px 图区裁切锚点（摄影图主体居中偏下） */
const TILE_OBJECT_POSITION: Record<HomeTodayTileKind, string> = {
  activity: 'center 42%',
  shelf: 'center 38%',
  read: 'center 55%',
  fellowship: 'center 45%',
  prayer: 'center 50%',
};

export function resolveTodayTileKind(slot: HomeTodayPanelSlot): HomeTodayTileKind {
  if (slot.id.startsWith('campaign-')) return 'activity';
  if (slot.id === 'shelf') return 'shelf';
  if (slot.icon === 'group' || slot.tag === '共读') return 'fellowship';
  if (slot.icon === 'prayer' || slot.tag === '祷告') return 'prayer';
  return 'read';
}

export function resolveTodayTileImage(slot: HomeTodayPanelSlot): string {
  if (slot.id.startsWith('campaign-') && slot.coverUrl) {
    const custom = resolveCampaignCoverUrl(slot.coverUrl);
    if (custom) return custom;
  }

  return clientAssetUrl(HOME_TILES[resolveTodayTileKind(slot)]);
}

export function resolveTodayTileObjectPosition(slot: HomeTodayPanelSlot): string {
  return TILE_OBJECT_POSITION[resolveTodayTileKind(slot)];
}
