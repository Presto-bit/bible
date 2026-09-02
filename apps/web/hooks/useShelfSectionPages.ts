'use client';

import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

/** 节内按视口高度分页，配合左右滑切换页/章。 */
export function useShelfSectionPages(
  articleRef: RefObject<HTMLElement | null>,
  viewportRef: RefObject<HTMLElement | null>,
  contentKey: string,
  initialPageIndex = 0,
) {
  const [pageIndex, setPageIndex] = useState(initialPageIndex);
  const [pageCount, setPageCount] = useState(1);
  const [pageHeight, setPageHeight] = useState(0);

  const remeasure = useCallback(() => {
    const vp = viewportRef.current;
    const art = articleRef.current;
    if (!vp || !art) return;
    const h = vp.clientHeight;
    if (h <= 0) return;
    art.style.removeProperty('transform');
    const total = Math.max(1, Math.ceil(art.scrollHeight / h));
    setPageHeight(h);
    setPageCount(total);
    setPageIndex((prev) => Math.min(Math.max(0, prev), total - 1));
  }, [articleRef, viewportRef]);

  useLayoutEffect(() => {
    setPageIndex(Math.max(0, initialPageIndex));
    remeasure();
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => remeasure());
    ro.observe(vp);
    return () => ro.disconnect();
  }, [contentKey, initialPageIndex, remeasure, viewportRef]);

  const goPage = useCallback(
    (delta: number) => {
      setPageIndex((i) => Math.min(pageCount - 1, Math.max(0, i + delta)));
    },
    [pageCount],
  );

  return {
    pageIndex,
    pageCount,
    pageHeight,
    setPageIndex,
    goPage,
    remeasure,
  };
}
