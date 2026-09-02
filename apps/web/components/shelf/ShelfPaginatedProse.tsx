'use client';

import { useEffect, useRef } from 'react';
import { useShelfSectionPages } from '@/hooks/useShelfSectionPages';

type Props = {
  html: string;
  contentKey: string;
  pageIndex: number;
  /** docx 教案走独立排版（字号更小） */
  variant?: 'html' | 'docx';
  onPageCount?: (count: number) => void;
  onTap?: () => void;
};

export default function ShelfPaginatedProse({
  html,
  contentKey,
  pageIndex,
  variant = 'html',
  onPageCount,
  onTap,
}: Props) {
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
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      remeasure();
    };
    run();
    const t1 = window.requestAnimationFrame(run);
    const t2 = window.setTimeout(run, 120);
    const t3 = window.setTimeout(run, 420);
    const art = articleRef.current;
    const imgs = art?.querySelectorAll('img') ?? [];
    imgs.forEach((img) => {
      if (img.complete) return;
      img.addEventListener('load', run, { once: true });
      img.addEventListener('error', run, { once: true });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [html, remeasure]);

  const proseClass = variant === 'docx' ? 'shelf-docx-prose' : 'shelf-prose';

  return (
    <div ref={viewportRef} className="shelf-page-viewport" onClick={onTap}>
      <article
        ref={articleRef}
        className={`shelf-turn-page ${proseClass}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
