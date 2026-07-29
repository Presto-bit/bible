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

  useEffect(() => {
    if (dragging == null) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const w = gridRef.current?.clientWidth;
      setCols(applyOpsColDrag(d.start, d.edge, e.clientX - d.startX, w));
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(null);
      document.body.classList.remove('ops-canvas-resizing');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging]);

  const onSplitterPointerDown = useCallback((edge: Edge) => {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { edge, startX: e.clientX, start: cols };
      setDragging(edge);
      document.body.classList.add('ops-canvas-resizing');
    };
  }, [cols]);

  const splitterProps = useCallback(
    (edge: Edge) => ({
      role: 'separator' as const,
      'aria-orientation': 'vertical' as const,
      'aria-label':
        edge === 0
          ? '调整左侧与预览宽度'
          : '调整预览与页面结构宽度（向左拖可加宽页面结构）',
      tabIndex: 0,
      className: `ops-canvas-splitter ops-canvas-splitter-${edge === 0 ? 'a' : 'b'}${
        dragging === edge ? ' is-dragging' : ''
      }`,
      onPointerDown: onSplitterPointerDown(edge),
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
    [dragging, onSplitterPointerDown],
  );

  return {
    gridRef,
    cols,
    gridStyle: opsCanvasGridStyle(cols),
    splitterProps,
    dragging,
  };
}
