/** 今日推荐 / 成长区固定插图：Cache Storage 持久缓存（不按日清）。 */

import { clientAssetUrl } from './basePath';

const CACHE_NAME = 'peiai-home-tiles-v1';

function canUseCaches(): boolean {
  return typeof window !== 'undefined' && typeof caches !== 'undefined';
}

function imageCacheKeys(src: string): string[] {
  const raw = src.trim();
  if (!raw || raw.startsWith('blob:') || raw.startsWith('data:')) return [];
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

function isLikelyImageBlob(blob: Blob): boolean {
  if (!blob.size) return false;
  const ct = (blob.type || '').toLowerCase();
  if (ct && !ct.startsWith('image/') && blob.size < 800) return false;
  return true;
}

/** 优先返回缓存 blob URL；未命中 null。 */
export async function getCachedHomeTileUrl(src: string): Promise<string | null> {
  if (!canUseCaches() || !src) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const key of imageCacheKeys(src)) {
      const hit = await cache.match(key);
      if (!hit?.ok) continue;
      const blob = await hit.blob();
      if (!isLikelyImageBlob(blob)) continue;
      return URL.createObjectURL(blob);
    }
    return null;
  } catch {
    return null;
  }
}

/** 写入 Cache Storage；已存在则跳过。 */
export async function ensureHomeTileImages(
  urls: Array<string | null | undefined>,
): Promise<void> {
  if (!canUseCaches()) return;
  const list = [...new Set(urls.filter((u): u is string => Boolean(u?.trim())))];
  if (!list.length) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      list.flatMap((url) =>
        imageCacheKeys(url).map(async (key) => {
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
