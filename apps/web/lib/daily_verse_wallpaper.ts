/** 每日经文壁纸：本地风景图按 day 轮换（public/daily-wallpapers；SW 不预拉，首次使用再 runtime cache）。 */

import { clientAssetUrl, clientWithBasePath, withBasePath } from './basePath';

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

function wallpaperFile(day?: number): string {
  const d = Math.max(1, Math.floor(day ?? 1) || 1);
  return DAILY_WALLPAPER_FILES[(d - 1) % DAILY_WALLPAPER_FILES.length];
}

/** 按每日经文 day 选取风景壁纸，同一天全员一致。 */
export function dailyVerseWallpaperUrl(
  day?: number,
  _variant: DailyVerseWallpaperVariant = 'card',
): string {
  return clientAssetUrl(`/daily-wallpapers/${wallpaperFile(day)}`);
}

/** SSR / OG 用相对站点路径（含 basePath） */
export function dailyVerseWallpaperPath(day?: number): string {
  return withBasePath(`/daily-wallpapers/${wallpaperFile(day)}`);
}

/** 活动主卡/副卡可选的系统风景背景（存相对路径，不含 basePath） */
export type SystemCoverOption = {
  id: string;
  file: string;
  /** 写入 coverUrl 的稳定路径 */
  path: string;
  /** 展示用 URL（含 basePath） */
  url: string;
};

export function systemCoverOptions(): SystemCoverOption[] {
  return DAILY_WALLPAPER_FILES.map((file) => {
    const path = `/daily-wallpapers/${file}`;
    return {
      id: file.replace(/\.jpg$/i, ''),
      file,
      path,
      url: clientAssetUrl(path),
    };
  });
}

/** 把活动 coverUrl 解析为可展示的图片 URL；无法识别则返回 null */
export function resolveCampaignCoverUrl(coverUrl?: string | null): string | null {
  const raw = (coverUrl || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path.includes('/daily-wallpapers/') || path.startsWith('/rail-scenes/')) {
    return clientAssetUrl(path);
  }
  if (/^scenery-\d+\.jpg$/i.test(raw)) {
    return clientAssetUrl(`/daily-wallpapers/${raw}`);
  }
  return clientAssetUrl(path);
}

/**
 * 用 XHR/blob 预取本地壁纸，避开部分 WebView 对 img+SW 的绘制黑洞。
 * 成功返回 object URL（调用方应 revoke）；失败返回原 url。
 */
export function preloadWallpaperObjectUrl(url: string): Promise<string> {
  if (typeof window === 'undefined' || !url) return Promise.resolve(url);
  if (url.startsWith('blob:') || url.startsWith('data:')) return Promise.resolve(url);
  // 强缓存可用后 default 更易命中磁盘；no-store 作弱网回退
  return fetch(url, { credentials: 'same-origin', cache: 'default' })
    .catch(() => fetch(url, { credentials: 'same-origin', cache: 'no-store' }))
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      // 部分 CDN 不写 content-type，靠 volume 判断
      if (blob.type && !blob.type.startsWith('image/') && blob.size < 800) {
        throw new Error('not-image');
      }
      if (blob.size < 200) throw new Error('empty');
      return URL.createObjectURL(blob);
    })
    .catch(() => url);
}

/** 规范化写入：尽量存 /daily-wallpapers/xxx.jpg */
export function normalizeCampaignCoverPath(coverUrl?: string | null): string {
  const raw = (coverUrl || '').trim();
  if (!raw) return '';
  const m = raw.match(/(?:\/)?daily-wallpapers\/(scenery-\d+\.jpg)/i);
  if (m) return `/daily-wallpapers/${m[1]}`;
  if (/^scenery-\d+\.jpg$/i.test(raw)) return `/daily-wallpapers/${raw}`;
  return raw;
}
