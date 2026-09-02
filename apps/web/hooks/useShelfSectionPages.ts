'use client';

import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

function measureViewportHeight(viewport: HTMLElement): number {
  const panel = viewport.closest('.shelf-turn-panel-active') as HTMLElement | null;
  if (panel && panel.clientHeight > 0) return panel.clientHeight;
  const rect = viewport.getBoundingClientRect().height;
  if (rect > 0) return rect;
  return viewport.clientHeight;
}

/** 节内按视口高度测量页数（配合 translateY 分页，禁止节内纵向滚动）。 */
export function useShelfSectionPages(
  articleRef: RefObject<HTMLElement | null>,
  viewportRef: RefObject<HTMLElement | null>,
  contentKey: string,
) {
  const [pageCount, setPageCount] = useState(1);
  const [pageHeight, setPageHeight] = useState(0);

  const remeasure = useCallback(() => {
    const vp = viewportRef.current;
    const art = articleRef.current;
    if (!vp || !art) return;
    const h = measureViewportHeight(vp);
    if (h <= 0) return;
    vp.style.height = `${h}px`;
    vp.style.maxHeight = `${h}px`;
    const prevTransform = art.style.transform;
    art.style.removeProperty('transform');
    const total = Math.max(1, Math.ceil(art.scrollHeight / h));
    art.style.transform = prevTransform;
    setPageHeight(h);
    setPageCount(total);
  }, [articleRef, viewportRef]);

  useLayoutEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    const run = () => {
      if (cancelled) return;
      remeasure();
      const vp = viewportRef.current;
      if (vp && measureViewportHeight(vp) <= 0) {
        retryTimer = window.setTimeout(run, 80);
      }
    };
    run();
    const t1 = window.requestAnimationFrame(run);
    const t2 = window.setTimeout(run, 160);
    const t3 = window.setTimeout(run, 480);
    const vp = viewportRef.current;
    const art = articleRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') {
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
        if (retryTimer) window.clearTimeout(retryTimer);
      };
    }
    const ro = new ResizeObserver(() => run());
    ro.observe(vp);
    if (art) ro.observe(art);
    const panel = vp.closest('.shelf-turn-panel-active');
    if (panel) ro.observe(panel);
    const fonts = document.fonts;
    if (fonts?.ready) {
      void fonts.ready.then(() => run());
    }
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      if (retryTimer) window.clearTimeout(retryTimer);
      ro.disconnect();
    };
  }, [contentKey, remeasure, viewportRef, articleRef]);

  return { pageCount, pageHeight, remeasure };
}
