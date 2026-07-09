import {
  useCallback,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from 'react';

/** 位移 ≥ 25% 且水平速度够快才翻页 */
const THRESHOLD = 0.25;
/** px/ms，约 300px/s；与 25% 位移同时满足才翻页 */
const VELOCITY_MIN = 0.3;
/** 竖滑优先：水平需明显大于竖直 */
const AXIS_RATIO = 1.6;
const AXIS_MIN_PX = 18;
const EDGE_RESIST = 0.28;
const ANIM_MS = 300;
const PREFETCH_RATIO = 0.04;
const BOUNDARY_RATIO = 0.12;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export type TurnDragSide = 'prev' | 'next';

export function useReaderPageTurn({
  enabled,
  canPrev,
  canNext,
  blocked,
  ignoreUntilRef,
  onChapterChange,
  onDragApproach,
  onBoundary,
}: {
  enabled: boolean;
  canPrev: boolean;
  canNext: boolean;
  blocked: boolean;
  /** 划词结束后短时忽略横滑，避免误翻页 */
  ignoreUntilRef?: MutableRefObject<number>;
  onChapterChange: (delta: number, meta?: { fromSwipe?: boolean }) => void | Promise<void>;
  onDragApproach?: (delta: number) => void;
  onBoundary?: (edge: 'prev' | 'next') => void;
}) {
  const [animating, setAnimating] = useState(false);
  const [offCenter, setOffCenter] = useState(false);
  const [dragSide, setDragSide] = useState<TurnDragSide | null>(null);
  const [dragProgress, setDragProgress] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const drag = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startTime: 0,
    axis: null as 'x' | 'y' | null,
    prefetched: false,
  });

  const applyOffset = useCallback((px: number, withAnim: boolean) => {
    offsetRef.current = px;
    setOffCenter(Math.abs(px) > 0.5);
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = withAnim ? `transform ${ANIM_MS}ms ease-out` : 'none';
    el.style.transform = `translateX(calc(-33.3333% + ${px}px))`;
  }, []);

  const updateDragHint = useCallback((px: number) => {
    const w = viewportRef.current?.clientWidth ?? window.innerWidth;
    if (px === 0) {
      setDragSide(null);
      setDragProgress(0);
      return;
    }
    setDragSide(px < 0 ? 'next' : 'prev');
    setDragProgress(Math.min(1, Math.abs(px) / w));
  }, []);

  const clampOffset = useCallback(
    (raw: number) => {
      let o = raw;
      if (!canNext && o < 0) o *= EDGE_RESIST;
      if (!canPrev && o > 0) o *= EDGE_RESIST;
      return o;
    },
    [canNext, canPrev],
  );

  const isIgnored = useCallback(() => {
    if (blocked) return true;
    if (ignoreUntilRef && Date.now() < ignoreUntilRef.current) return true;
    return false;
  }, [blocked, ignoreUntilRef]);

  const finishDrag = useCallback(async () => {
    if (!enabled || !drag.current.active) return;
    const wasHorizontal = drag.current.axis === 'x';
    const finalOffset = offsetRef.current;
    const elapsed = Math.max(1, performance.now() - drag.current.startTime);
    const velocity = Math.abs(finalOffset) / elapsed;

    drag.current.active = false;
    drag.current.pointerId = -1;
    drag.current.axis = null;

    const clearDragHint = () => {
      setDragSide(null);
      setDragProgress(0);
    };

    if (!wasHorizontal) {
      clearDragHint();
      applyOffset(0, false);
      return;
    }

    const w = viewportRef.current?.clientWidth ?? window.innerWidth;
    const ratio = Math.abs(finalOffset) / w;
    const commit = ratio >= THRESHOLD && velocity >= VELOCITY_MIN;

    if (finalOffset < 0 && commit && canNext) {
      clearDragHint();
      setAnimating(true);
      applyOffset(-w, true);
      await sleep(ANIM_MS);
      try {
        await Promise.resolve(onChapterChange(1, { fromSwipe: true }));
      } finally {
        requestAnimationFrame(() => {
          applyOffset(0, false);
          setAnimating(false);
        });
      }
      return;
    }

    if (finalOffset > 0 && commit && canPrev) {
      clearDragHint();
      setAnimating(true);
      applyOffset(w, true);
      await sleep(ANIM_MS);
      try {
        await Promise.resolve(onChapterChange(-1, { fromSwipe: true }));
      } finally {
        requestAnimationFrame(() => {
          applyOffset(0, false);
          setAnimating(false);
        });
      }
      return;
    }

    if (finalOffset < 0 && !canNext && ratio >= BOUNDARY_RATIO) {
      onBoundary?.('next');
    } else if (finalOffset > 0 && !canPrev && ratio >= BOUNDARY_RATIO) {
      onBoundary?.('prev');
    }

    if (Math.abs(finalOffset) < 1) {
      clearDragHint();
      applyOffset(0, false);
      return;
    }

    setAnimating(true);
    clearDragHint();
    applyOffset(0, true);
    await sleep(ANIM_MS);
    applyOffset(0, false);
    setAnimating(false);
  }, [enabled, canPrev, canNext, onChapterChange, onBoundary, applyOffset]);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (!enabled || animating || isIgnored()) return;
      if (e.button !== 0) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      drag.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTime: performance.now(),
        axis: null,
        prefetched: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled, animating, isIgnored],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!enabled || !drag.current.active || e.pointerId !== drag.current.pointerId) return;
      if (isIgnored()) return;
      const dx = e.clientX - drag.current.startX;
      const dy = e.clientY - drag.current.startY;

      if (!drag.current.axis) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx < AXIS_MIN_PX && ady < AXIS_MIN_PX) return;
        if (adx >= AXIS_MIN_PX && adx > ady * AXIS_RATIO) {
          drag.current.axis = 'x';
        } else {
          drag.current.axis = 'y';
        }
      }

      if (drag.current.axis !== 'x') return;
      e.preventDefault();

      const next = clampOffset(dx);
      applyOffset(next, false);
      updateDragHint(next);

      const w = viewportRef.current?.clientWidth ?? window.innerWidth;
      const ratio = Math.abs(next) / w;
      if (!drag.current.prefetched && ratio >= PREFETCH_RATIO && onDragApproach) {
        drag.current.prefetched = true;
        onDragApproach(next < 0 ? 1 : -1);
      }
    },
    [enabled, isIgnored, clampOffset, applyOffset, updateDragHint, onDragApproach],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (!drag.current.active || e.pointerId !== drag.current.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      void finishDrag();
    },
    [finishDrag],
  );

  const onPointerCancel = useCallback(
    (e: PointerEvent) => {
      if (!drag.current.active || e.pointerId !== drag.current.pointerId) return;
      void finishDrag();
    },
    [finishDrag],
  );

  return {
    viewportRef,
    trackRef,
    dragSide,
    dragProgress,
    animating,
    offCenter,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
