/** 每日经文壁纸：风景图按 day 轮换（Unsplash 稳定直链，离线失败时由组件回退渐变）。 */

/** 自然风景图（横图/竖图均可，组件内 object-fit: cover） */
const SCENERY_URLS = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80', // 雪山
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80', // 山谷晨光
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80', // 林间阳光
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80', // 雾山
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80', // 湖光
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80', // 星空山脊
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1200&q=80', // 田野
  'https://images.unsplash.com/photo-1433086966358-54859d0ed716?auto=format&fit=crop&w=1200&q=80', // 瀑布
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80', // 海岸
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80', // 高峰
  'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?auto=format&fit=crop&w=1200&q=80', // 日出海
  'https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?auto=format&fit=crop&w=1200&q=80', // 森林雾
];

export type DailyVerseWallpaperVariant = 'card' | 'full';

function withWallpaperSize(url: string, variant: DailyVerseWallpaperVariant): string {
  try {
    const u = new URL(url);
    if (variant === 'full') {
      u.searchParams.set('w', '2400');
      u.searchParams.set('q', '88');
    } else {
      u.searchParams.set('w', '1200');
      u.searchParams.set('q', '80');
    }
    u.searchParams.set('auto', 'format');
    u.searchParams.set('fit', 'crop');
    return u.toString();
  } catch {
    return url;
  }
}

/** 按每日经文 day 选取风景壁纸，同一天全员一致。 */
export function dailyVerseWallpaperUrl(
  day?: number,
  variant: DailyVerseWallpaperVariant = 'card',
): string {
  const d = Math.max(1, Math.floor(day ?? 1) || 1);
  const base = SCENERY_URLS[(d - 1) % SCENERY_URLS.length];
  return withWallpaperSize(base, variant);
}
