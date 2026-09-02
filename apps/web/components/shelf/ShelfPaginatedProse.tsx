'use client';

import { useEffect, useRef } from 'react';
import { useShelfSectionPages } from '@/hooks/useShelfSectionPages';

type Props = {
  html: string;
  contentKey: string;
  pageIndex: number;
  onPageCount?: (count: number) => void;
  onTap?: () => void;
};

export default function ShelfPaginatedProse({ html, contentKey, pageIndex, onPageCount, onTap }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const { pageCount, pageHeight, remeasure } = useShelfSectionPages(
    articleRef,
    viewportRef,
    contentKey,
  );

  useEffect(() => {
    onPageCount?.(pageCount);
  }, [pageCount, onPageCount]);

  useEffect(() => {
    const art = articleRef.current;
    if (!art || pageHeight <= 0) return;
    art.style.transform = `translate3d(0, ${-pageIndex * pageHeight}px, 0)`;
  }, [pageIndex, pageHeight]);

  useEffect(() => {
    const t = window.requestAnimationFrame(() => remeasure());
    return () => window.cancelAnimationFrame(t);
  }, [html, remeasure]);

  return (
    <div ref={viewportRef} className="shelf-page-viewport" onClick={onTap}>
      <article
        ref={articleRef}
        className="shelf-turn-page shelf-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
