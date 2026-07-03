/** 每日经文壁纸：同源静态插画（按 day 轮换，离线可用）。 */

import { ILLUSTRATION_FILES, localIllustrationUrl } from './illustrations';

/** 按每日经文 day（1–124 循环）选取壁纸背景，同一天全员一致。 */
export function dailyVerseWallpaperUrl(day?: number): string {
  const d = Math.max(1, Math.floor(day ?? 1) || 1);
  const file = ILLUSTRATION_FILES[(d - 1) % ILLUSTRATION_FILES.length];
  return localIllustrationUrl(file);
}
