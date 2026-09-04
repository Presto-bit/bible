/** 今日推荐 2×2 上图区：坑位固定摄影 / 书封 / 运营图 */

import { bookCoverImageUrl, bookIdFromReaderHref } from './book_cover';
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
  if (slot.coverUrl) {
    const custom = resolveCampaignCoverUrl(slot.coverUrl);
    if (custom) return custom;
  }

  if (slot.bookId) return bookCoverImageUrl(slot.bookId);
  const fromHref = bookIdFromReaderHref(slot.href)?.bookId;
  if (fromHref) return bookCoverImageUrl(fromHref);

  return HOME_TILES[resolveTodayTileKind(slot)];
}

export function resolveTodayTileObjectPosition(slot: HomeTodayPanelSlot): string {
  if (slot.coverUrl || slot.bookId || bookIdFromReaderHref(slot.href)?.bookId) {
    return 'center 35%';
  }
  return TILE_OBJECT_POSITION[resolveTodayTileKind(slot)];
}
