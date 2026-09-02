'use client';

import { useRef, useState, type TouchEventHandler } from 'react';

const DEFAULT_THRESHOLD = 56;

/** 水平滑动手势：右滑 / 左滑触发回调（取主导轴，避免与竖滑冲突）。 */
export function useHorizontalSwipeAction(opts: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  enabled?: boolean;
}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    threshold = DEFAULT_THRESHOLD,
    enabled = true,
  } = opts;

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<'h' | 'v' | null>(null);
  const [dragX, setDragX] = useState(0);

  const reset = () => {
    startRef.current = null;
    axisRef.current = null;
    setDragX(0);
  };

  const onTouchStart: TouchEventHandler<HTMLElement> = (e) => {
    if (!enabled) return;
    const t = e.touches[0];
    if (!t) return;
    startRef.current = { x: t.clientX, y: t.clientY };
    axisRef.current = null;
    setDragX(0);
  };

  const onTouchMove: TouchEventHandler<HTMLElement> = (e) => {
    if (!enabled || !startRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    if (!axisRef.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axisRef.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (axisRef.current !== 'h') return;
    setDragX(dx);
    e.stopPropagation();
  };

  const onTouchEnd: TouchEventHandler<HTMLElement> = (e) => {
    if (!enabled || !startRef.current) {
      reset();
      return;
    }
    const t = e.changedTouches[0];
    const dx = t ? t.clientX - startRef.current.x : dragX;
    const wasHorizontal = axisRef.current === 'h';
    reset();
    if (!wasHorizontal) return;
    if (dx >= threshold) onSwipeRight?.();
    else if (dx <= -threshold) onSwipeLeft?.();
  };

  const onTouchCancel: TouchEventHandler<HTMLElement> = () => {
    reset();
  };

  return {
    dragX,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
