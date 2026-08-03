import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * 跟手翻页（与 iOS/Android 已安装 PWA 同一套）：
 * - Pointer 走 window 级 move/up（不依赖 setPointerCapture；壳 WebView 捕获常失败）
 * - Touch 兜底；pointer 已激活但尚无轴时 touch 可接手
 * - 提交阈值：大位移 OR 够快；上一页（右滑）略松
 */
const THRESHOLD_NEXT = 0.13;
const THRESHOLD_PREV = 0.09;
const VELOCITY_MIN = 0.12;
const VELOCITY_MIN_PREV = 0.09;
/** 大滑动：忽略速度强制翻页 */
const FORCE_RATIO_NEXT = 0.24;
const FORCE_RATIO_PREV = 0.18;
const AXIS_RATIO = 1.15;
const AXIS_MIN_PX = 8;
const EDGE_RESIST = 0.28;
const ANIM_MS = 280;
const PREFETCH_RATIO = 0.04;
const BOUNDARY_RATIO = 0.1;

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
  ignoreUntilRef?: MutableRefObject<number>;
  onChapterChange: (delta: number, meta?: { fromSwipe?: boolean }) => void | Promise<void>;
  onDragApproach?: (delta: number) => void;
  onBoundary?: (edge: 'prev' | 'next') => void;
}) {
  const [animating, setAnimating] = useState(false);
  const [offCenter, setOffCenter] = useState(false);
  const [dragSide, setDragSide] = useState<TurnDragSide | null>(null);
  const [dragProgress, setDragProgress] = useState(0);
  /** 横滑中锁定竖滚，避免 WebView 抢走手势 */
  const [turning, setTurning] = useState(false);

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
    source: 'pointer' as 'pointer' | 'touch',
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
    setTurning(false);

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
    const goingPrev = finalOffset > 0;
    // 右滑上一页：阈值更低（系统边缘返回易吞手势）
    const threshold = goingPrev ? THRESHOLD_PREV : THRESHOLD_NEXT;
    const forceRatio = goingPrev ? FORCE_RATIO_PREV : FORCE_RATIO_NEXT;
    const velMin = goingPrev ? VELOCITY_MIN_PREV : VELOCITY_MIN;
    const commit =
      ratio >= forceRatio
      || ratio >= threshold
      || (ratio >= (goingPrev ? 0.07 : 0.09) && velocity >= velMin);

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

  const beginDrag = useCallback(
    (clientX: number, clientY: number, pointerId: number, source: 'pointer' | 'touch') => {
      if (!enabled || animating || isIgnored()) return false;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return false;
      drag.current = {
        active: true,
        pointerId,
        startX: clientX,
        startY: clientY,
        startTime: performance.now(),
        axis: null,
        prefetched: false,
        source,
      };
      return true;
    },
    [enabled, animating, isIgnored],
  );

  const moveDrag = useCallback(
    (clientX: number, clientY: number, pointerId: number, preventDefault?: () => void) => {
      if (!enabled || !drag.current.active || pointerId !== drag.current.pointerId) return;
      if (isIgnored()) return;
      const dx = clientX - drag.current.startX;
      const dy = clientY - drag.current.startY;

      if (!drag.current.axis) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx < AXIS_MIN_PX && ady < AXIS_MIN_PX) return;
        if (adx >= AXIS_MIN_PX && adx > ady * AXIS_RATIO) {
          drag.current.axis = 'x';
          setTurning(true);
        } else if (ady >= AXIS_MIN_PX && ady >= adx * AXIS_RATIO) {
          drag.current.axis = 'y';
        } else if (adx >= AXIS_MIN_PX * 1.2 && adx > ady) {
          // 横略大于竖也认 X（右滑上一页更容易抢走竖滚）
          drag.current.axis = 'x';
          setTurning(true);
        } else {
          drag.current.axis = 'y';
        }
      }

      if (drag.current.axis !== 'x') return;
      preventDefault?.();

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

  // window 级 pointer 跟踪：与 Chrome 已安装 PWA 一致，不依赖元素上的 capture
  useEffect(() => {
    if (!enabled) return;

    const onWinPointerMove = (e: PointerEvent) => {
      if (!drag.current.active || drag.current.source !== 'pointer') return;
      if (e.pointerId !== drag.current.pointerId) return;
      moveDrag(e.clientX, e.clientY, e.pointerId, () => {
        if (drag.current.axis === 'x') e.preventDefault();
      });
    };
    const onWinPointerUp = (e: PointerEvent) => {
      if (!drag.current.active || drag.current.source !== 'pointer') return;
      if (e.pointerId !== drag.current.pointerId) return;
      void finishDrag();
    };
    const onWinPointerCancel = (e: PointerEvent) => {
      if (!drag.current.active || drag.current.source !== 'pointer') return;
      if (e.pointerId !== drag.current.pointerId) return;
      void finishDrag();
    };

    window.addEventListener('pointermove', onWinPointerMove, { passive: false });
    window.addEventListener('pointerup', onWinPointerUp, { passive: true });
    window.addEventListener('pointercancel', onWinPointerCancel, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onWinPointerMove);
      window.removeEventListener('pointerup', onWinPointerUp);
      window.removeEventListener('pointercancel', onWinPointerCancel);
    };
  }, [enabled, moveDrag, finishDrag]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      if (!beginDrag(e.clientX, e.clientY, e.pointerId, 'pointer')) return;
      // 仍尝试 capture（iOS 无妨）；主要靠 window 监听保证壳端可用
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [beginDrag],
  );

  // 保留 React 路径作桌面/回退；window 已 listen 时 move 可能双触发，id 一致且幂等
  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (drag.current.source !== 'pointer') return;
      moveDrag(e.clientX, e.clientY, e.pointerId, () => e.preventDefault());
    },
    [moveDrag],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!drag.current.active || drag.current.source !== 'pointer') return;
      if (e.pointerId !== drag.current.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      void finishDrag();
    },
    [finishDrag],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent) => {
      if (!drag.current.active || drag.current.source !== 'pointer') return;
      if (e.pointerId !== drag.current.pointerId) return;
      void finishDrag();
    },
    [finishDrag],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      // pointer 已占坑但还没认轴时，touch 接手（壳上 pointer move 常丢）
      if (drag.current.active) {
        if (drag.current.source === 'pointer' && drag.current.axis === null) {
          drag.current.source = 'touch';
          drag.current.pointerId = t.identifier;
        }
        return;
      }
      beginDrag(t.clientX, t.clientY, t.identifier, 'touch');
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!drag.current.active || drag.current.source !== 'touch') return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY, t.identifier, () => {
        if (drag.current.axis === 'x') e.preventDefault();
      });
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!drag.current.active || drag.current.source !== 'touch') return;
      if (e.changedTouches.length < 1) return;
      const t = e.changedTouches[0];
      if (t.identifier !== drag.current.pointerId) return;
      void finishDrag();
    };
    const onTouchCancel = () => {
      if (!drag.current.active || drag.current.source !== 'touch') return;
      void finishDrag();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [enabled, beginDrag, moveDrag, finishDrag]);

  return {
    viewportRef,
    trackRef,
    dragSide,
    dragProgress,
    animating,
    offCenter,
    turning,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
