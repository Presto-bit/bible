/** 自研经文选区：基于 .verse-word 词块，不依赖系统 Selection API */

import type { WordAnchor } from './selection_range';

export type WordHit = WordAnchor;

export function wordFromPoint(x: number, y: number, root?: HTMLElement | null): WordHit | null {
  const node = document.elementFromPoint(x, y);
  const w = node?.closest('.verse-word') as HTMLElement | null;
  if (!w) return null;
  if (root && !root.contains(w)) return null;
  const verse = Number(w.dataset.v);
  const start = Number(w.dataset.s);
  const end = Number(w.dataset.e);
  if (!verse || Number.isNaN(start) || Number.isNaN(end)) return null;
  return { verse, start, end };
}

export type CustomSelectCallbacks = {
  onRange: (anchor: WordHit, focus: WordHit) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
};

const DRAG_THRESHOLD = 10;
const LONG_PRESS_MS = 420;

/**
 * 在容器上安装统一指针选区（鼠标拖选 + 触控长按/拖选）。
 * 返回卸载函数。
 */
export function installCustomVerseSelection(
  el: HTMLElement,
  callbacks: CustomSelectCallbacks,
): () => void {
  let anchor: (WordHit & { x: number; y: number }) | null = null;
  let dragging = false;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let activePointerId: number | null = null;

  const clearLongPress = () => {
    if (longPressTimer != null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const w = wordFromPoint(e.clientX, e.clientY, el);
    if (!w) return;
    if (activePointerId != null) return;
    activePointerId = e.pointerId;
    anchor = { ...w, x: e.clientX, y: e.clientY };
    dragging = false;
    callbacks.onGestureStart?.();
    clearLongPress();
    if (e.pointerType === 'touch') {
      longPressTimer = setTimeout(() => {
        if (!anchor || dragging) return;
        callbacks.onRange(anchor, anchor);
        clearLongPress();
      }, LONG_PRESS_MS);
    }
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId || !anchor) return;
    const dx = e.clientX - anchor.x;
    const dy = e.clientY - anchor.y;
    if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragging = true;
    clearLongPress();
    if (e.pointerType === 'touch') e.preventDefault();
    const w = wordFromPoint(e.clientX, e.clientY, el);
    if (!w) return;
    callbacks.onRange(anchor, w);
  };

  const finish = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    if (!dragging && anchor && e.pointerType === 'mouse') {
      callbacks.onRange(anchor, anchor);
    }
    clearLongPress();
    anchor = null;
    dragging = false;
    activePointerId = null;
    callbacks.onGestureEnd?.();
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerUp = (e: PointerEvent) => finish(e);
  const onPointerCancel = (e: PointerEvent) => finish(e);

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerCancel);

  return () => {
    clearLongPress();
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerCancel);
  };
}
