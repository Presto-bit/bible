'use client';

import { useCallback, useRef, useState, type CSSProperties, type TouchEvent as ReactTouchEvent } from 'react';
import { SHEET_DISMISS_DY } from '@/lib/reader_gesture';
import { prefersReducedMotion } from '@/lib/peiai_motion';

const DRAG_CAP = 220;

type Options = {
  onClose: () => void;
  /** 仅从抓条 / 顶部开始拖；false 则内容到顶也可下拖 */
  enabled?: boolean;
  /** 叠加在 translateY 之前的基础 transform（如居中 `translateX(-50%)`） */
  baseTransform?: string;
};

/**
 * 半屏下拖关闭：跟手位移 + 阈值 / 速度提交。
 * 与 ReaderSheetPortal 行为对齐，供 MotionSheet 复用。
 */
export function useSheetDrag({ onClose, enabled = true, baseTransform = '' }: Options) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const fromHead = useRef(false);
  const draggingDown = useRef(false);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);

  const reset = useCallback(() => {
    touchStartY.current = null;
    fromHead.current = false;
    draggingDown.current = false;
    setDragOffset(0);
    setDragging(false);
  }, []);

  const onTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (!enabled || prefersReducedMotion()) return;
      touchStartY.current = e.touches[0]?.clientY ?? null;
      lastY.current = touchStartY.current ?? 0;
      lastT.current = performance.now();
      velocity.current = 0;
      draggingDown.current = false;
      setSettling(false);
      const t = e.target;
      fromHead.current =
        t instanceof Node &&
        (headRef.current?.contains(t) === true ||
          (t instanceof Element && t.classList.contains('half-sheet-grab')));
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const startY = touchStartY.current;
      if (startY == null) return;
      const y = e.touches[0]?.clientY ?? startY;
      const now = performance.now();
      const dt = Math.max(1, now - lastT.current);
      velocity.current = ((y - lastY.current) / dt) * 1000;
      lastY.current = y;
      lastT.current = now;

      const dy = y - startY;
      const atTop = fromHead.current || (bodyRef.current?.scrollTop ?? 0) <= 0;
      if (dy > 0 && atTop) {
        draggingDown.current = true;
        setDragging(true);
        setDragOffset(Math.min(dy, DRAG_CAP));
        e.stopPropagation();
      } else if (draggingDown.current) {
        draggingDown.current = false;
        setDragging(false);
        setDragOffset(0);
      }
    },
    [enabled],
  );

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (!enabled) {
        reset();
        return;
      }
      const startY = touchStartY.current;
      const dy = startY != null ? (e.changedTouches[0]?.clientY ?? startY) - startY : 0;
      const fast = velocity.current > 700;
      const shouldClose = draggingDown.current && (dy > SHEET_DISMISS_DY || fast);
      if (shouldClose) {
        setDragging(false);
        setSettling(true);
        setDragOffset(typeof window !== 'undefined' ? window.innerHeight : 640);
        window.setTimeout(() => {
          onClose();
          reset();
          setSettling(false);
        }, 280);
        return;
      }
      if (dragOffset > 0) {
        setSettling(true);
        setDragging(false);
        setDragOffset(0);
        window.setTimeout(() => setSettling(false), 420);
      }
      touchStartY.current = null;
      fromHead.current = false;
      draggingDown.current = false;
    },
    [dragOffset, enabled, onClose, reset],
  );

  const onTouchCancel = useCallback(() => {
    if (dragOffset > 0) setSettling(true);
    reset();
    window.setTimeout(() => setSettling(false), 420);
  }, [dragOffset, reset]);

  const ty = `translateY(${dragOffset}px)`;
  const panelStyle: CSSProperties | undefined =
    dragOffset > 0 || settling
      ? {
          transform: baseTransform ? `${baseTransform} ${ty}` : ty,
          transition: dragging ? 'none' : undefined,
        }
      : undefined;

  const scrimOpacity =
    dragOffset > 0
      ? Math.max(0.12, 1 - dragOffset / (typeof window !== 'undefined' ? window.innerHeight * 0.55 : 400))
      : undefined;

  return {
    bodyRef,
    headRef,
    dragOffset,
    dragging,
    settling,
    panelStyle,
    scrimOpacity,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
    },
  };
}
