/** 探索专题详情内存缓存：列表触达时预取，点开可秒开 */

import { api, type KnowledgeLayout, type MapTour } from '@/lib/api';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';
import {
  isJourneyManuscriptId,
  journeyManuscriptCover,
} from '@/lib/journey_covers';

export type KnowledgeDetailBundle = {
  tour: MapTour | null;
  layout: KnowledgeLayout | null;
};

const bundleCache = new Map<string, KnowledgeDetailBundle>();
const inflight = new Map<string, Promise<KnowledgeDetailBundle>>();

function preloadRaster(path: string, highPriority = false) {
  if (typeof window === 'undefined' || !path) return;
  const { webp, fallback } = knowledgeRasterSources(path);
  const primary = webp || fallback;
  // 高优：用 link preload，比 Image() 更早占连接
  if (highPriority && primary) {
    const id = `kx-preload-${primary}`;
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'preload';
      link.as = 'image';
      link.href = primary;
      link.setAttribute('fetchpriority', 'high');
      document.head.appendChild(link);
    }
  }
  const img = new Image();
  img.decoding = 'async';
  img.src = primary;
  if (webp && primary === webp) {
    img.onerror = () => {
      const fb = new Image();
      fb.decoding = 'async';
      fb.src = fallback;
    };
  }
}

/** 预热手稿首页 + 邻站（WebP 优先，体积约 PNG 的 1/10） */
export function warmManuscriptRasters(
  layout: KnowledgeLayout | null | undefined,
  tourId?: string,
) {
  if (typeof window === 'undefined') return;
  const id = (tourId || layout?.source?.id || layout?.id || '').trim();
  if (id && isJourneyManuscriptId(id)) {
    preloadRaster(journeyManuscriptCover(id), true);
    const orders = (layout?.beats || [])
      .map((b) => b.order)
      .filter((n): n is number => typeof n === 'number' && n > 0)
      .slice(0, 1);
    for (const order of orders) {
      const n = String(order).padStart(2, '0');
      preloadRaster(`/knowledge/infographics/${encodeURIComponent(id)}-s${n}.png`);
    }
  }
  if (layout?.cover_image) preloadRaster(layout.cover_image, !isJourneyManuscriptId(id));
  const firstVignette = (layout?.beats || []).find((b) => b.vignette)?.vignette;
  if (firstVignette) preloadRaster(firstVignette);
}

export function peekKnowledgeDetail(id: string): KnowledgeDetailBundle | null {
  const key = (id || '').trim();
  if (!key) return null;
  return bundleCache.get(key) || null;
}

export function putKnowledgeDetail(id: string, bundle: KnowledgeDetailBundle) {
  const key = (id || '').trim();
  if (!key) return;
  bundleCache.set(key, bundle);
}

export function stubTourFromLayout(layout: KnowledgeLayout, fallbackId?: string): MapTour {
  const id = (layout.source?.id || layout.id || fallbackId || '').trim() || 'unknown';
  return {
    id,
    title: layout.title || id,
    subtitle: layout.guide_one_liner || '',
    stops: [],
  };
}

/** 预取 layout + tour；可重复调用，共享 in-flight */
export function prefetchKnowledgeDetail(id: string): Promise<KnowledgeDetailBundle> {
  const key = (id || '').trim();
  if (!key) {
    return Promise.resolve({ tour: null, layout: null });
  }
  const hit = bundleCache.get(key);
  if (hit?.layout) {
    warmManuscriptRasters(hit.layout, key);
    return Promise.resolve(hit);
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const tourP = api.mapTour(key).then((r) => r.tour).catch(() => null);
  const layoutP = api.knowledgeLayout(key).then((r) => r.layout).catch(() => null);

  // layout 先到先写入缓存，点开可不等 mapTour
  void layoutP.then((layout) => {
    if (!layout) return;
    const prev = bundleCache.get(key);
    bundleCache.set(key, { tour: prev?.tour ?? null, layout });
    warmManuscriptRasters(layout, key);
  });
  void tourP.then((tour) => {
    if (!tour) return;
    const prev = bundleCache.get(key);
    bundleCache.set(key, { tour, layout: prev?.layout ?? null });
  });

  const task = Promise.all([tourP, layoutP])
    .then(([tour, layout]) => {
      const bundle: KnowledgeDetailBundle = { tour, layout };
      if (tour || layout) bundleCache.set(key, bundle);
      warmManuscriptRasters(layout, key);
      return bundle;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}
