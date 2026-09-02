'use client';

import { useCallback, useEffect, useRef } from 'react';

type Props = {
  html: string;
  contentKey: string;
  /** flow 续读：0–1 滚动比例 */
  scrollOffset?: number;
  /** 进入上一节时滚到末尾 */
  scrollToEnd?: boolean;
  variant?: 'html' | 'docx';
  onScrollProgress?: (ratio: number) => void;
  onTap?: () => void;
};

export default function ShelfPaginatedProse({
  html,
  contentKey,
  scrollOffset = 0,
  scrollToEnd = false,
  variant = 'html',
  onScrollProgress,
  onTap,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    syncRef.current = true;
    requestAnimationFrame(() => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (scrollToEnd) {
        el.scrollTop = max;
      } else if (scrollOffset > 0) {
        el.scrollTop = scrollOffset * max;
      } else {
        el.scrollTop = 0;
      }
      syncRef.current = false;
    });
  }, [contentKey, html, scrollOffset, scrollToEnd]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const el = viewportRef.current;
      if (!el) return;
      const imgs = el.querySelectorAll('img');
      imgs.forEach((img) => {
        if (img.complete) return;
        img.addEventListener('load', run, { once: true });
        img.addEventListener('error', run, { once: true });
      });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [html]);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = viewportRef.current;
      if (!el || syncRef.current) return;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const ratio = max > 0 ? el.scrollTop / max : 0;
      onScrollProgress?.(ratio);
    });
  }, [onScrollProgress]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const proseClass = variant === 'docx' ? 'shelf-docx-prose' : 'shelf-prose';

  return (
    <div
      ref={viewportRef}
      className="shelf-flow-viewport"
      onScroll={handleScroll}
      onClick={onTap}
    >
      <article
        className={`shelf-flow-article ${proseClass}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
