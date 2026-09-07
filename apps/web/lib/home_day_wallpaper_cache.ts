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

/** 校验是否像可用壁纸（拦 HTML/空体/网关错误页进 Cache） */
async function isLikelyImageBlob(blob: Blob): Promise<boolean> {
  if (!blob || blob.size < 200) return false;
  const ct = (blob.type || '').toLowerCase();
  if (ct.startsWith('image/')) return blob.size >= 200;
  if (ct && !ct.startsWith('application/octet-stream') && ct !== '') {
    // text/html、application/json 等
    if (ct.includes('html') || ct.includes('json') || ct.startsWith('text/')) return false;
  }
  try {
    const head = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    const isJpeg = head[0] === 0xff && head[1] === 0xd8;
    const isPng = head[0] === 0x89 && head[1] === 0x50;
    const isWebp =
      blob.size >= 12
      && head[0] === 0x52
      && head[1] === 0x49
      && head[2] === 0x46;
    if (isJpeg || isPng) return true;
    if (isWebp) {
      const riff = new Uint8Array(await blob.slice(8, 12).arrayBuffer());
      return riff[0] === 0x57 && riff[1] === 0x45 && riff[2] === 0x42 && riff[3] === 0x50;
    }
  } catch {
    /* ignore */
  }
  // 无魔数且体积过小：不可信
  return blob.size >= 8_000 && (!ct || ct === 'application/octet-stream');
}

/** 优先返回当日缓存的 blob URL；坏缓存会删掉再返回 null。 */
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
      if (!(await isLikelyImageBlob(blob))) {
        await cache.delete(key);
        continue;
      }
      return URL.createObjectURL(blob);
    }
    return null;
  } catch {
    return null;
  }
}

/** 删除某壁纸的坏缓存键（解码失败后调用）。 */
export async function invalidateCachedHomeWallpaper(src: string): Promise<void> {
  if (!canUseCaches() || !src) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(wallpaperCacheKeys(src).map((key) => cache.delete(key)));
  } catch {
    /* ignore */
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
          if (hit?.ok) {
            const blob = await hit.blob();
            if (await isLikelyImageBlob(blob)) return;
            await cache.delete(key);
          }
          try {
            const fetchUrl = /^https?:\/\//i.test(url) ? url : clientAssetUrl(url);
            const res = await fetch(fetchUrl, {
              credentials: 'same-origin',
              cache: 'default',
            });
            if (!res.ok) return;
            const blob = await res.clone().blob();
            if (!(await isLikelyImageBlob(blob))) return;
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
