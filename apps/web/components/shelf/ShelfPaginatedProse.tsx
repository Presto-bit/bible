'use client';

import { useCallback, useEffect, useRef } from 'react';

const EDGE_THRESHOLD = 28;
const SECTION_EDGE_COOLDOWN_MS = 900;

type Props = {
  html: string;
  contentKey: string;
  /** flow 续读：0–1 滚动比例 */
  scrollOffset?: number;
  /** 进入上一节时滚到末尾 */
  scrollToEnd?: boolean;
  variant?: 'html' | 'docx';
  onScrollProgress?: (ratio: number) => void;
  onSectionEdge?: (edge: 'prev' | 'next') => void;
  canPrevSection?: boolean;
  canNextSection?: boolean;
  onTap?: () => void;
};

export default function ShelfPaginatedProse({
  html,
  contentKey,
  scrollOffset = 0,
  scrollToEnd = false,
  variant = 'html',
  onScrollProgress,
  onSectionEdge,
  canPrevSection = false,
  canNextSection = false,
  onTap,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const edgeLockRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const syncRef = useRef(false);

  const fireSectionEdge = useCallback(
    (edge: 'prev' | 'next') => {
      if (edgeLockRef.current) return;
      edgeLockRef.current = true;
      onSectionEdge?.(edge);
      window.setTimeout(() => {
        edgeLockRef.current = false;
      }, SECTION_EDGE_COOLDOWN_MS);
    },
    [onSectionEdge],
  );

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
      lastScrollTopRef.current = el.scrollTop;
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
    const el = viewportRef.current;
    if (!el || syncRef.current) return;
    const top = el.scrollTop;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const ratio = max > 0 ? top / max : 0;
    onScrollProgress?.(ratio);

    const goingDown = top > lastScrollTopRef.current;
    const goingUp = top < lastScrollTopRef.current;
    lastScrollTopRef.current = top;

    const atBottom = top + el.clientHeight >= el.scrollHeight - EDGE_THRESHOLD;
    const atTop = top <= EDGE_THRESHOLD;

    if (atBottom && goingDown && canNextSection) {
      fireSectionEdge('next');
    } else if (atTop && goingUp && canPrevSection) {
      fireSectionEdge('prev');
    }
  }, [canNextSection, canPrevSection, fireSectionEdge, onScrollProgress]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const el = viewportRef.current;
      if (!el) return;
      if (el.scrollTop <= EDGE_THRESHOLD && e.deltaY < 0 && canPrevSection) {
        fireSectionEdge('prev');
      }
    },
    [canPrevSection, fireSectionEdge],
  );

  const proseClass = variant === 'docx' ? 'shelf-docx-prose' : 'shelf-prose';

  return (
    <div
      ref={viewportRef}
      className="shelf-flow-viewport"
      onScroll={handleScroll}
      onWheel={handleWheel}
      onClick={onTap}
    >
      <article
        className={`shelf-flow-article ${proseClass}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {canNextSection ? (
        <div className="shelf-flow-scroll-tail" aria-hidden>
          继续下滑进入下一节
        </div>
      ) : null}
    </div>
  );
}
