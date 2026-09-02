'use client';

import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

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
    const h = vp.clientHeight;
    if (h <= 0) return;
    const prevTransform = art.style.transform;
    art.style.removeProperty('transform');
    const total = Math.max(1, Math.ceil(art.scrollHeight / h));
    art.style.transform = prevTransform;
    setPageHeight(h);
    setPageCount(total);
  }, [articleRef, viewportRef]);

  useLayoutEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      remeasure();
      const vp = viewportRef.current;
      if (vp && vp.clientHeight <= 0) {
        window.setTimeout(run, 80);
      }
    };
    run();
    const vp = viewportRef.current;
    const art = articleRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return () => {
      cancelled = true;
    };
    const ro = new ResizeObserver(() => run());
    ro.observe(vp);
    if (art) ro.observe(art);
    const fonts = document.fonts;
    if (fonts?.ready) {
      void fonts.ready.then(() => run());
    }
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [contentKey, remeasure, viewportRef, articleRef]);

  return { pageCount, pageHeight, remeasure };
}
