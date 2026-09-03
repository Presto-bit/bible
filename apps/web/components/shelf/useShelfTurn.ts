import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { shouldYieldShelfTurn, shelfTurnStartsInVerticalScroll } from '@/lib/shelf_gesture';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

/**
 * 跟手翻页（与 iOS/Android 已安装 PWA 同一套）：
 * - Pointer 走 window 级 move/up（不依赖 setPointerCapture；壳 WebView 捕获易抢词典）
 * - Touch 兜底；pointer 已激活但尚无轴时 touch 可接手
 * - 提交阈值：大位移 OR 够快；上一页（右滑）略松
 * - 专有名词/按钮：composedPath + 邻点让路，避免「点词典没反应」
 */
const THRESHOLD_NEXT = 0.028;
const THRESHOLD_PREV = 0.022;
const VELOCITY_MIN = 0.032;
const VELOCITY_MIN_PREV = 0.026;
/** 大滑动：忽略速度强制翻页 */
const FORCE_RATIO_NEXT = 0.065;
const FORCE_RATIO_PREV = 0.05;
const AXIS_RATIO = 1.0;
const AXIS_MIN_PX = 3;
/** 左右边缘切章带宽度（与 .shelf-turn-edge 一致） */
const EDGE_SWIPE_PX = 88;
const EDGE_RESIST = 0.22;
const ANIM_MS = 180;
const PREFETCH_RATIO = 0.04;
const BOUNDARY_RATIO = 0.1;
/** is-turning + touch-action:none 硬超时，防粘死 */
const TURNING_STUCK_MS = 900;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isProseTurnTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.shelf-flow-viewport, .shelf-flow-article, .shelf-docx-prose'));
}

function isEdgeSwipeZone(clientX: number) {
  if (typeof window === 'undefined') return false;
  return clientX < EDGE_SWIPE_PX || clientX > window.innerWidth - EDGE_SWIPE_PX;
}

export type ShelfTurnKind = 'page' | 'section' | 'none';
export type TurnDragSide = 'prev' | 'next';

export function useShelfTurn({
  enabled,
  canPrev,
  canNext,
  blocked,
  snapOnly = true,
  edgeOnly = true,
  resolveTurn,
  onSectionChange,
  onPageChange,
  onDragApproach,
  onBoundary,
}: {
  enabled: boolean;
  canPrev: boolean;
  canNext: boolean;
  blocked: boolean;
  /** 为 true 时横滑不跟手拖动页面，仅在阈值提交时翻页 */
  snapOnly?: boolean;
  /** 为 true 时仅屏幕左右边缘带可发起切章，中间区域留给滚动/划选 */
  edgeOnly?: boolean;
  resolveTurn: (delta: 1 | -1) => ShelfTurnKind;
  onSectionChange: (delta: number, meta?: { fromSwipe?: boolean }) => void | Promise<void>;
  onPageChange?: (delta: 1 | -1) => void | Promise<void>;
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
  const prevEdgeRef = useRef<HTMLDivElement>(null);
  const nextEdgeRef = useRef<HTMLDivElement>(null);
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
    inVerticalScroll: false,
    fromEdge: false,
    inProse: false,
    lastDx: 0,
    lastDy: 0,
  });
  const applyOffset = useCallback((px: number, withAnim: boolean) => {
    offsetRef.current = px;
    setOffCenter(Math.abs(px) > 0.5);
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = withAnim ? `transform ${ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none';
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

  const isIgnored = useCallback(() => blocked, [blocked]);

  /** 打开 sheet / 打断手势时强制复位，避免 is-turning + touch-action:none 粘死 */
  const cancelDrag = useCallback(() => {
    const pid = drag.current.pointerId;
    const vp = viewportRef.current;
    drag.current.active = false;
    drag.current.pointerId = -1;
    drag.current.axis = null;
    drag.current.prefetched = false;
    setTurning(false);
    setDragSide(null);
    setDragProgress(0);
    applyOffset(0, false);
    // 释放 capture + 强制剥 is-turning（React 一帧迟滞时壳上仍只剩竖滚）
    if (vp) {
      if (pid >= 0) {
        try {
          vp.releasePointerCapture?.(pid);
        } catch {
          /* ignore */
        }
      }
      vp.classList.remove('is-turning');
    }
    try {
      document
        .querySelectorAll('.shelf-turn-viewport.is-turning')
        .forEach((el) => el.classList.remove('is-turning'));
    } catch {
      /* ignore */
    }
  }, [applyOffset]);

  // blocked 变 true（半屏打开）或关回 false：清拖拽态，恢复横滑能力
  useEffect(() => {
    cancelDrag();
  }, [blocked, cancelDrag]);

  // 横滑锁死态硬超时（安卓中断手势后 sticky）
  useEffect(() => {
    if (!turning) return;
    const t = window.setTimeout(() => {
      cancelDrag();
    }, TURNING_STUCK_MS);
    return () => window.clearTimeout(t);
  }, [turning, cancelDrag]);

  // 回前台 / 可见 / 词典半屏关闭后的 resume：清粘连
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') cancelDrag();
    };
    const onUnlock = () => cancelDrag();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('peiai-shell-resume', onVis as EventListener);
    window.addEventListener('peiai-reader-unlock', onUnlock as EventListener);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('peiai-shell-resume', onVis as EventListener);
      window.removeEventListener('peiai-reader-unlock', onUnlock as EventListener);
    };
  }, [cancelDrag]);

  const finishDrag = useCallback(async () => {
    if (!enabled || !drag.current.active) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      drag.current.active = false;
      drag.current.pointerId = -1;
      drag.current.axis = null;
      setTurning(false);
      setDragSide(null);
      setDragProgress(0);
      applyOffset(0, false);
      return;
    }
    const wasHorizontal = drag.current.axis === 'x';
    let finalOffset = offsetRef.current;
    const elapsed = Math.max(1, performance.now() - drag.current.startTime);
    const adx = Math.abs(drag.current.lastDx);
    const ady = Math.abs(drag.current.lastDy);

    if (!wasHorizontal && adx >= 8 && adx > ady * 1.04) {
      finalOffset = drag.current.lastDx;
    }

    drag.current.active = false;
    drag.current.pointerId = -1;
    drag.current.axis = null;
    setTurning(false);

    const clearDragHint = () => {
      setDragSide(null);
      setDragProgress(0);
    };

    const velocity = Math.abs(finalOffset) / elapsed;
    const horizontalIntent = wasHorizontal || (adx >= 8 && adx > ady * 1.04);

    if (!horizontalIntent) {
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
      || (ratio >= (goingPrev ? 0.05 : 0.06) && velocity >= velMin);

    if (finalOffset < 0 && commit && canNext) {
      const kind = resolveTurn(1);
      clearDragHint();
      if (kind === 'page') {
        applyOffset(0, false);
        await Promise.resolve(onPageChange?.(1));
        return;
      }
      if (kind === 'section') {
        clearDragHint();
        applyOffset(0, false);
        if (snapOnly) {
          await Promise.resolve(onSectionChange(1, { fromSwipe: true }));
          return;
        }
        setAnimating(true);
        applyOffset(-w, true);
        await sleep(ANIM_MS);
        applyOffset(0, false);
        try {
          await Promise.resolve(onSectionChange(1, { fromSwipe: true }));
        } finally {
          setAnimating(false);
        }
        return;
      }
    }

    if (finalOffset > 0 && commit && canPrev) {
      const kind = resolveTurn(-1);
      clearDragHint();
      if (kind === 'page') {
        applyOffset(0, false);
        await Promise.resolve(onPageChange?.(-1));
        return;
      }
      if (kind === 'section') {
        clearDragHint();
        applyOffset(0, false);
        if (snapOnly) {
          await Promise.resolve(onSectionChange(-1, { fromSwipe: true }));
          return;
        }
        setAnimating(true);
        applyOffset(w, true);
        await sleep(ANIM_MS);
        applyOffset(0, false);
        try {
          await Promise.resolve(onSectionChange(-1, { fromSwipe: true }));
        } finally {
          setAnimating(false);
        }
        return;
      }
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

    clearDragHint();
    if (snapOnly) {
      applyOffset(0, false);
      return;
    }

    setAnimating(true);
    applyOffset(0, true);
    await sleep(ANIM_MS);
    applyOffset(0, false);
    setAnimating(false);
  }, [enabled, canPrev, canNext, resolveTurn, onSectionChange, onPageChange, onBoundary, applyOffset, snapOnly]);

  const beginDrag = useCallback(
    (clientX: number, clientY: number, pointerId: number, source: 'pointer' | 'touch', target?: EventTarget | null) => {
      if (!enabled || animating || isIgnored()) return false;
      const fromEdge = isEdgeSwipeZone(clientX);
      if (edgeOnly && !fromEdge) return false;
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
        inVerticalScroll: shelfTurnStartsInVerticalScroll(target ?? null, clientX),
        fromEdge,
        inProse: isProseTurnTarget(target),
        lastDx: 0,
        lastDy: 0,
      };
      return true;
    },
    [enabled, animating, isIgnored, edgeOnly],
  );

  const moveDrag = useCallback(
    (clientX: number, clientY: number, pointerId: number, preventDefault?: () => void) => {
      if (!enabled || !drag.current.active || pointerId !== drag.current.pointerId) return;
      if (isIgnored()) return;
      const dx = clientX - drag.current.startX;
      const dy = clientY - drag.current.startY;
      drag.current.lastDx = dx;
      drag.current.lastDy = dy;

      if (!drag.current.axis) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        const hRatio = drag.current.inVerticalScroll ? 1.04 : AXIS_RATIO;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && drag.current.inProse) {
          drag.current.active = false;
          drag.current.pointerId = -1;
          setTurning(false);
          setDragSide(null);
          setDragProgress(0);
          applyOffset(0, false);
          return;
        }
        if (adx < AXIS_MIN_PX && ady < AXIS_MIN_PX) return;
        if (drag.current.inProse && !drag.current.fromEdge) {
          if (ady >= 10 && ady >= adx * 0.88) {
            drag.current.active = false;
            drag.current.pointerId = -1;
            setTurning(false);
            setDragSide(null);
            setDragProgress(0);
            applyOffset(0, false);
            return;
          }
          if (adx >= 8 && adx > ady * 1.06) {
            drag.current.axis = 'x';
            setTurning(true);
          } else {
            return;
          }
        } else if (drag.current.fromEdge && adx >= 3 && adx > ady * 0.45) {
          drag.current.axis = 'x';
          setTurning(true);
        } else if (adx >= AXIS_MIN_PX && adx > ady * hRatio) {
          drag.current.axis = 'x';
          setTurning(true);
        } else if (ady >= AXIS_MIN_PX && ady >= adx * AXIS_RATIO) {
          drag.current.active = false;
          drag.current.pointerId = -1;
          setTurning(false);
          setDragSide(null);
          setDragProgress(0);
          applyOffset(0, false);
          return;
        } else if (adx >= AXIS_MIN_PX && adx > ady * (drag.current.inVerticalScroll ? 1.0 : 0.95)) {
          drag.current.axis = 'x';
          setTurning(true);
        } else if (ady >= AXIS_MIN_PX && ady > adx * 1.2) {
          drag.current.active = false;
          drag.current.pointerId = -1;
          setTurning(false);
          setDragSide(null);
          setDragProgress(0);
          applyOffset(0, false);
          return;
        } else {
          return;
        }
      }

      if (drag.current.axis !== 'x') return;
      preventDefault?.();

      const next = clampOffset(dx);
      offsetRef.current = next;
      if (!snapOnly) {
        applyOffset(next, false);
        updateDragHint(next);
      }

      const w = viewportRef.current?.clientWidth ?? window.innerWidth;
      const ratio = Math.abs(next) / w;
      if (!drag.current.prefetched && ratio >= PREFETCH_RATIO && onDragApproach) {
        drag.current.prefetched = true;
        onDragApproach(next < 0 ? 1 : -1);
      }
    },
    [enabled, isIgnored, clampOffset, applyOffset, updateDragHint, onDragApproach, snapOnly],
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
      // 词典/按钮优先：composedPath + 邻点，勿 setPointerCapture 抢词
      if (shouldYieldShelfTurn(e.target, e.clientX, e.clientY, e.nativeEvent)) return;
      if (!beginDrag(e.clientX, e.clientY, e.pointerId, 'pointer', e.target)) return;
      // 安卓壳：capture 会吞邻域点击；靠 window pointermove/up 即可
      if (isPeiaiAndroidShell()) return;
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
    const viewport = viewportRef.current;
    const edges = [prevEdgeRef.current, nextEdgeRef.current].filter(Boolean) as HTMLElement[];
    const targets = edgeOnly ? edges : viewport ? [viewport, ...edges] : edges;
    if (!targets.length || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        cancelDrag();
        return;
      }
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (shouldYieldShelfTurn(e.target, t.clientX, t.clientY, e)) return;
      if (drag.current.active && drag.current.source === 'pointer') {
        drag.current.source = 'touch';
        drag.current.pointerId = t.identifier;
        return;
      }
      if (drag.current.active) return;
      if (!beginDrag(t.clientX, t.clientY, t.identifier, 'touch', e.target)) return;
      e.stopPropagation();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        cancelDrag();
        return;
      }
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

    for (const el of targets) {
      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd, { passive: true });
      el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    }
    return () => {
      for (const el of targets) {
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchend', onTouchEnd);
        el.removeEventListener('touchcancel', onTouchCancel);
      }
    };
  }, [enabled, edgeOnly, beginDrag, moveDrag, finishDrag, cancelDrag, canPrev, canNext]);

  const turnHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };

  return {
    viewportRef,
    prevEdgeRef,
    nextEdgeRef,
    trackRef,
    dragSide,
    dragProgress,
    animating,
    offCenter,
    turning,
    cancelDrag,
    turnHandlers,
    edgeHandlers: turnHandlers,
  };
}
