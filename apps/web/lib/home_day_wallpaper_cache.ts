/** 首页背景图按本地自然日缓存（Cache Storage）；跨日清旧键。 */

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

/** 优先返回当日缓存的 blob URL；未命中返回 null。 */
export async function getCachedHomeWallpaperUrl(
  src: string,
  ymd: string = localYmd(),
): Promise<string | null> {
  if (!canUseCaches() || !src) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(src);
    if (!hit || !hit.ok) return null;
    const blob = await hit.blob();
    if (!blob.size) return null;
    return URL.createObjectURL(blob);
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
      list.map(async (url) => {
        const hit = await cache.match(url);
        if (hit?.ok) return;
        try {
          const res = await fetch(url, { credentials: 'same-origin', mode: 'cors' });
          if (res.ok) await cache.put(url, res.clone());
        } catch {
          /* ignore */
        }
      }),
    );
  } catch {
    /* ignore */
  }
}

export { localYmd as homeWallpaperLocalYmd };
