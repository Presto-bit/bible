'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  applyOpsColDrag,
  clampCols,
  loadOpsCanvasCols,
  OPS_COL_DEFAULT,
  opsCanvasGridStyle,
  saveOpsCanvasCols,
  type OpsCanvasCols,
} from '@/lib/ops_canvas_columns';

type Edge = 0 | 1;

/** 活动编辑三栏可拖拽分隔条 + 列宽状态 */
export function useOpsCanvasResize() {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState<OpsCanvasCols>(OPS_COL_DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState<Edge | null>(null);
  const dragRef = useRef<{ edge: Edge; startX: number; start: OpsCanvasCols } | null>(null);

  useEffect(() => {
    setCols(loadOpsCanvasCols());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setCols((prev) => clampCols(prev, w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveOpsCanvasCols(cols);
  }, [cols, hydrated]);

  const onSplitterPointerDown = useCallback((edge: Edge) => {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { edge, startX: e.clientX, start: cols };
      setDragging(edge);
      document.body.classList.add('ops-canvas-resizing');
    };
  }, [cols]);

  const onSplitterPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const w = gridRef.current?.clientWidth;
    const next = applyOpsColDrag(d.start, d.edge, e.clientX - d.startX, w);
    setCols(next);
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(null);
    document.body.classList.remove('ops-canvas-resizing');
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const splitterProps = useCallback(
    (edge: Edge) => ({
      role: 'separator' as const,
      'aria-orientation': 'vertical' as const,
      'aria-label': edge === 0 ? '调整左侧与页面结构宽度' : '调整页面结构与预览宽度',
      tabIndex: 0,
      className: `ops-canvas-splitter ops-canvas-splitter-${edge === 0 ? 'a' : 'b'}${
        dragging === edge ? ' is-dragging' : ''
      }`,
      onPointerDown: onSplitterPointerDown(edge),
      onPointerMove: onSplitterPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown: (ev: React.KeyboardEvent<HTMLDivElement>) => {
        const step = ev.shiftKey ? 32 : 16;
        let dx = 0;
        if (ev.key === 'ArrowLeft') dx = -step;
        else if (ev.key === 'ArrowRight') dx = step;
        else return;
        ev.preventDefault();
        const w = gridRef.current?.clientWidth;
        setCols((prev) => applyOpsColDrag(prev, edge, dx, w));
      },
    }),
    [dragging, endDrag, onSplitterPointerDown, onSplitterPointerMove],
  );

  return {
    gridRef,
    cols,
    gridStyle: opsCanvasGridStyle(cols),
    splitterProps,
    dragging,
  };
}
