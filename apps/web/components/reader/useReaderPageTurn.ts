import { useCallback, useRef, useState, type CSSProperties, type TouchEvent } from 'react';

const THRESHOLD = 0.25;
const EDGE_RESIST = 0.28;
const ANIM_MS = 220;

export function useReaderPageTurn({
  enabled,
  chapter,
  chapterCount,
  blocked,
  onChapterChange,
}: {
  enabled: boolean;
  chapter: number;
  chapterCount: number;
  blocked: boolean;
  onChapterChange: (delta: number) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    axis: null as 'x' | 'y' | null,
  });

  const canPrev = chapter > 1;
  const canNext = chapter < chapterCount;

  const clampOffset = useCallback(
    (raw: number) => {
      let o = raw;
      if (!canNext && o < 0) o *= EDGE_RESIST;
      if (!canPrev && o > 0) o *= EDGE_RESIST;
      return o;
    },
    [canNext, canPrev],
  );

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || blocked || animating) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      drag.current = {
        active: true,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        axis: null,
      };
    },
    [enabled, blocked, animating],
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled || !drag.current.active || blocked) return;
      const dx = e.touches[0].clientX - drag.current.startX;
      const dy = e.touches[0].clientY - drag.current.startY;
      if (!drag.current.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (drag.current.axis !== 'x') return;
      e.preventDefault();
      setOffset(clampOffset(dx));
    },
    [enabled, blocked, clampOffset],
  );

  const finishDrag = useCallback(() => {
    if (!enabled || !drag.current.active) return;
    const wasHorizontal = drag.current.axis === 'x';
    drag.current.active = false;
    drag.current.axis = null;

    if (!wasHorizontal) {
      setOffset(0);
      return;
    }

    const w = viewportRef.current?.clientWidth ?? window.innerWidth;
    const ratio = Math.abs(offset) / w;

    if (offset < 0 && ratio >= THRESHOLD && canNext) {
      setAnimating(true);
      setOffset(-w);
      window.setTimeout(() => {
        onChapterChange(1);
        setOffset(0);
        setAnimating(false);
      }, ANIM_MS);
      return;
    }
    if (offset > 0 && ratio >= THRESHOLD && canPrev) {
      setAnimating(true);
      setOffset(w);
      window.setTimeout(() => {
        onChapterChange(-1);
        setOffset(0);
        setAnimating(false);
      }, ANIM_MS);
      return;
    }

    setAnimating(true);
    setOffset(0);
    window.setTimeout(() => setAnimating(false), ANIM_MS);
  }, [enabled, offset, canPrev, canNext, onChapterChange]);

  const trackStyle: CSSProperties = {
    transform: `translateX(calc(-33.3333% + ${offset}px))`,
    transition: animating ? `transform ${ANIM_MS}ms ease-out` : 'none',
  };

  return {
    viewportRef,
    trackStyle,
    onTouchStart,
    onTouchMove,
    onTouchEnd: finishDrag,
    onTouchCancel: finishDrag,
  };
}
