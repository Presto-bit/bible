/** 首页背景图按本地自然日缓存（Cache Storage）；跨日清旧键。 */

import { clientAssetUrl } from './basePath';

const CACHE_NAME = 'peiai-home-bg-v1';
const DAY_KEY = 'peiai_home_bg_day';

function localYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function canUseCaches(): boolean {
  return typeof window !== 'undefined' && typeof caches !== 'undefined';
}

/** 绝对/相对 URL 统一成 Cache Storage 可匹配的候选键。 */
function wallpaperCacheKeys(src: string): string[] {
  const raw = src.trim();
  if (!raw) return [];
  const out = new Set<string>([raw]);
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      out.add(u.pathname);
      out.add(`${u.pathname}${u.search}`);
    } catch {
      /* ignore */
    }
  } else {
    const rel = raw.startsWith('/') ? raw : `/${raw}`;
    out.add(rel);
    out.add(clientAssetUrl(rel));
  }
  return [...out];
}

/** 优先返回当日缓存的 blob URL；未命中返回 null。 */
export async function getCachedHomeWallpaperUrl(
  src: string,
  ymd: string = localYmd(),
): Promise<string | null> {
  if (!canUseCaches() || !src) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const key of wallpaperCacheKeys(src)) {
      const hit = await cache.match(key);
      if (!hit || !hit.ok) continue;
      const blob = await hit.blob();
      if (!blob.size) continue;
      const ct = (blob.type || '').toLowerCase();
      if (ct && !ct.startsWith('image/') && blob.size < 800) continue;
      return URL.createObjectURL(blob);
    }
    return null;
  } catch {
    return null;
  }
}

/** 确保 urls 写入当日缓存；并删除非今日条目。 */
export async function ensureHomeDayWallpapers(
  urls: Array<string | null | undefined>,
  ymd: string = localYmd(),
): Promise<void> {
  if (!canUseCaches()) return;
  const list = [...new Set(urls.filter((u): u is string => Boolean(u && u.trim())))];
  if (!list.length) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const prev = localStorage.getItem(DAY_KEY);
    if (prev && prev !== ymd) {
      const keys = await cache.keys();
      await Promise.all(keys.map((req) => cache.delete(req)));
    }
    localStorage.setItem(DAY_KEY, ymd);
    await Promise.all(
      list.flatMap((url) =>
        wallpaperCacheKeys(url).map(async (key) => {
          const hit = await cache.match(key);
          if (hit?.ok) return;
          try {
            const fetchUrl = /^https?:\/\//i.test(url) ? url : clientAssetUrl(url);
            const res = await fetch(fetchUrl, {
              credentials: 'same-origin',
              cache: 'default',
            });
            if (!res.ok) return;
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct && !ct.includes('image') && (await res.clone().blob()).size < 800) return;
            await cache.put(key, res.clone());
          } catch {
            /* ignore */
          }
        }),
      ),
    );
  } catch {
    /* ignore */
  }
}

export { localYmd as homeWallpaperLocalYmd };
