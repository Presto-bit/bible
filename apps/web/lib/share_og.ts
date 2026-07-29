/** 出站分享落地页 OG 图：优先氛围壁纸，便于微信/系统预览 */

import { analysisShareSiteOrigin } from './analysis_share';
import { dailyVerseWallpaperPath } from './daily_verse_wallpaper';

export function shareOgImageUrl(day?: number): {
  url: string;
  width: number;
  height: number;
} {
  const origin = analysisShareSiteOrigin();
  return {
    url: `${origin}${dailyVerseWallpaperPath(day)}`,
    width: 1200,
    height: 800,
  };
}
