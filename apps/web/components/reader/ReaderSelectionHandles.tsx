'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  measureSelHandlePositions,
  pinnedSpanBounds,
  rebuildPinnedFromEdges,
  verseCharAtPoint,
  type NativePinnedHighlight,
  type SelHandlePoint,
} from '@/lib/native_verse_selection';
import { readerScrollEl } from '@/lib/reader_viewport';

type Edge = 'start' | 'end';

type Props = {
  rootRef: RefObject<HTMLElement | null>;
  pinned: NativePinnedHighlight | null;
  visible: boolean;
  onAdjust: (next: NativePinnedHighlight) => void;
  onDragChange?: (dragging: boolean) => void;
};

/**
 * PWA/触控：系统选区收起后，自绘起止手柄，拖动扩/缩选区（跟手近似 iOS）。
 */
export function ReaderSelectionHandles({
  rootRef,
  pinned,
  visible,
  onAdjust,
  onDragChange,
}: Props) {
  const [pos, setPos] = useState<{ start: SelHandlePoint; end: SelHandlePoint } | null>(null);
  const [liveFinger, setLiveFinger] = useState<{ edge: Edge; x: number; y: number } | null>(null);
  const dragRef = useRef<{
    edge: Edge;
    pointerId: number;
    bounds: NonNullable<ReturnType<typeof pinnedSpanBounds>>;
  } | null>(null);
  const rafHitRef = useRef(0);
  const pendingPointRef = useRef<{ x: number; y: number } | null>(null);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const onAdjustRef = useRef(onAdjust);
  onAdjustRef.current = onAdjust;
  const onDragChangeRef = useRef(onDragChange);
  onDragChangeRef.current = onDragChange;

  const refresh = useCallback(() => {
    if (dragRef.current) return;
    const next = measureSelHandlePositions(rootRef.current);
    setPos(next);
  }, [rootRef]);

  useEffect(() => {
    if (!visible || !pinned?.spans.length) {
      setPos(null);
      setLiveFinger(null);
      return;
    }
    refresh();
    const raf = requestAnimationFrame(refresh);
    const scrollEl = readerScrollEl(rootRef.current);
    scrollEl?.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      cancelAnimationFrame(raf);
      scrollEl?.removeEventListener('scroll', refresh);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [visible, pinned, refresh, rootRef]);

  const flushHit = useCallback(() => {
    rafHitRef.current = 0;
    const drag = dragRef.current;
    const pt = pendingPointRef.current;
    if (!drag || !pt) return;
    const hit = verseCharAtPoint(rootRef.current, pt.x, pt.y, { edge: drag.edge });
    if (!hit) return;
    const next =
      drag.edge === 'start'
        ? rebuildPinnedFromEdges(
          rootRef.current,
          hit.verse,
          hit.offset,
          drag.bounds.endVerse,
          drag.bounds.endOff,
        )
        : rebuildPinnedFromEdges(
          rootRef.current,
          drag.bounds.startVerse,
          drag.bounds.startOff,
          hit.verse,
          hit.offset,
        );
    if (!next) return;
    onAdjustRef.current(next);
    // 拖动中手柄跟手指；松手后再量 DOM
    const measured = measureSelHandlePositions(rootRef.current);
    if (measured) {
      setPos({
        start:
          drag.edge === 'start'
            ? { x: pt.x, y: pt.y - measured.start.h / 2, h: measured.start.h }
            : measured.start,
        end:
          drag.edge === 'end'
            ? { x: pt.x, y: pt.y - measured.end.h / 2, h: measured.end.h }
            : measured.end,
      });
    }
  }, [rootRef]);

  const endDrag = useCallback((pointerId?: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (pointerId != null && drag.pointerId !== pointerId) return;
    dragRef.current = null;
    pendingPointRef.current = null;
    if (rafHitRef.current) {
      cancelAnimationFrame(rafHitRef.current);
      rafHitRef.current = 0;
    }
    setLiveFinger(null);
    document.body.classList.remove('reader-sel-handle-dragging');
    onDragChangeRef.current?.(false);
    requestAnimationFrame(() => {
      const next = measureSelHandlePositions(rootRef.current);
      setPos(next);
    });
  }, [rootRef]);

  // document 级跟手：iOS 上按钮 pointermove 容易丢事件
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.preventDefault();
      pendingPointRef.current = { x: e.clientX, y: e.clientY };
      setLiveFinger({ edge: drag.edge, x: e.clientX, y: e.clientY });
      if (!rafHitRef.current) {
        rafHitRef.current = requestAnimationFrame(flushHit);
      }
    };
    const onUp = (e: PointerEvent) => {
      endDrag(e.pointerId);
    };
    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onUp, { capture: true });
    document.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    };
  }, [endDrag, flushHit]);

  const onPointerDown = useCallback(
    (edge: Edge) => (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const cur = pinnedRef.current;
      const bounds = cur ? pinnedSpanBounds(cur.spans) : null;
      if (!bounds) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { edge, pointerId: e.pointerId, bounds };
      pendingPointRef.current = { x: e.clientX, y: e.clientY };
      setLiveFinger({ edge, x: e.clientX, y: e.clientY });
      document.body.classList.add('reader-sel-handle-dragging');
      onDragChangeRef.current?.(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      // 立刻按落点调一次，给反馈
      if (!rafHitRef.current) {
        rafHitRef.current = requestAnimationFrame(flushHit);
      }
    },
    [flushHit],
  );

  if (!visible || !pos) return null;

  const startPoint =
    liveFinger?.edge === 'start'
      ? { x: liveFinger.x, y: liveFinger.y - pos.start.h / 2, h: pos.start.h }
      : pos.start;
  const endPoint =
    liveFinger?.edge === 'end'
      ? { x: liveFinger.x, y: liveFinger.y - pos.end.h / 2, h: pos.end.h }
      : pos.end;

  return (
    <>
      <div
        role="slider"
        tabIndex={0}
        className="reader-sel-handle reader-sel-handle-start"
        aria-label="调整选区起点"
        style={{
          left: `${startPoint.x}px`,
          top: `${startPoint.y}px`,
          height: `${Math.max(22, startPoint.h)}px`,
        }}
        onPointerDown={onPointerDown('start')}
        onClick={(e) => e.stopPropagation()}
      />
      <div
        role="slider"
        tabIndex={0}
        className="reader-sel-handle reader-sel-handle-end"
        aria-label="调整选区终点"
        style={{
          left: `${endPoint.x}px`,
          top: `${endPoint.y}px`,
          height: `${Math.max(22, endPoint.h)}px`,
        }}
        onPointerDown={onPointerDown('end')}
        onClick={(e) => e.stopPropagation()}
      />
    </>
  );
}
