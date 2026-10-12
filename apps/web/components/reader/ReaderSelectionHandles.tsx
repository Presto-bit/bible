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
 * PWA/触控：系统选区收起后，自绘起止手柄，拖动扩/缩选区。
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
  const rafRef = useRef(0);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;

  const refresh = useCallback(() => {
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

  const applyAtPoint = useCallback(
    (edge: Edge, x: number, y: number, base: NonNullable<ReturnType<typeof pinnedSpanBounds>>) => {
      const hit = verseCharAtPoint(rootRef.current, x, y);
      if (!hit) return;
      const next =
        edge === 'start'
          ? rebuildPinnedFromEdges(
            rootRef.current,
            hit.verse,
            hit.offset,
            base.endVerse,
            base.endOff,
          )
          : rebuildPinnedFromEdges(
            rootRef.current,
            base.startVerse,
            base.startOff,
            hit.verse,
            hit.offset,
          );
      if (!next) return;
      onAdjust(next);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        refresh();
      });
    },
    [onAdjust, refresh, rootRef],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      setLiveFinger(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onDragChange?.(false);
      refresh();
    },
    [onDragChange, refresh],
  );

  const onPointerDown = useCallback(
    (edge: Edge) => (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const cur = pinnedRef.current;
      const bounds = cur ? pinnedSpanBounds(cur.spans) : null;
      if (!bounds) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { edge, pointerId: e.pointerId, bounds };
      setLiveFinger({ edge, x: e.clientX, y: e.clientY });
      onDragChange?.(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [onDragChange],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      setLiveFinger({ edge: drag.edge, x: e.clientX, y: e.clientY });
      applyAtPoint(drag.edge, e.clientX, e.clientY, drag.bounds);
    },
    [applyAtPoint],
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
      <button
        type="button"
        className="reader-sel-handle reader-sel-handle-start"
        aria-label="调整选区起点"
        style={{
          left: `${startPoint.x}px`,
          top: `${startPoint.y}px`,
          height: `${Math.max(18, startPoint.h)}px`,
        }}
        onPointerDown={onPointerDown('start')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="reader-sel-handle reader-sel-handle-end"
        aria-label="调整选区终点"
        style={{
          left: `${endPoint.x}px`,
          top: `${endPoint.y}px`,
          height: `${Math.max(18, endPoint.h)}px`,
        }}
        onPointerDown={onPointerDown('end')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={(e) => e.stopPropagation()}
      />
    </>
  );
}
