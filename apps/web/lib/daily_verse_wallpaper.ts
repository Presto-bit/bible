/** 每日经文壁纸：本地风景图按 day 轮换（public/daily-wallpapers，SW 预缓存）。 */

import { clientWithBasePath } from './basePath';

/** 与 public/daily-wallpapers/ 文件名一致（源自 Unsplash，已打包离线使用） */
export const DAILY_WALLPAPER_FILES = [
  'scenery-01.jpg',
  'scenery-02.jpg',
  'scenery-03.jpg',
  'scenery-04.jpg',
  'scenery-05.jpg',
  'scenery-06.jpg',
  'scenery-07.jpg',
  'scenery-08.jpg',
  'scenery-09.jpg',
  'scenery-10.jpg',
  'scenery-11.jpg',
  'scenery-12.jpg',
  'scenery-13.jpg',
  'scenery-14.jpg',
  'scenery-15.jpg',
  'scenery-16.jpg',
  'scenery-17.jpg',
  'scenery-18.jpg',
  'scenery-19.jpg',
  'scenery-20.jpg',
  'scenery-21.jpg',
  'scenery-22.jpg',
  'scenery-23.jpg',
  'scenery-24.jpg',
  'scenery-25.jpg',
  'scenery-26.jpg',
  'scenery-27.jpg',
  'scenery-28.jpg',
  'scenery-29.jpg',
  'scenery-30.jpg',
  'scenery-31.jpg',
] as const;

export type DailyVerseWallpaperVariant = 'card' | 'full';

/** 按每日经文 day 选取风景壁纸，同一天全员一致。 */
export function dailyVerseWallpaperUrl(
  day?: number,
  _variant: DailyVerseWallpaperVariant = 'card',
): string {
  const d = Math.max(1, Math.floor(day ?? 1) || 1);
  const file = DAILY_WALLPAPER_FILES[(d - 1) % DAILY_WALLPAPER_FILES.length];
  return clientWithBasePath(`/daily-wallpapers/${file}`);
}
