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

/** 预取用：今日推荐 + 成长区固定插图绝对 URL（Hero 壁纸见 dailyVerseWallpaperWarmUrl） */
export function homeTodayTileWarmUrls(): string[] {
  const paths = [...Object.values(HOME_TILES), ...HOME_GROWTH_PATHS];
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
