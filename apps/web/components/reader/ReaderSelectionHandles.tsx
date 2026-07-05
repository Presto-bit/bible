'use client';

import { useLayoutEffect, useState } from 'react';
import { normalizeWordRange, type WordAnchor, type WordRange } from '@/lib/selection_range';

type Props = {
  wordRange: WordRange;
  contentRef: React.RefObject<HTMLElement | null>;
  onRangeChange: (anchor: WordAnchor, focus: WordAnchor) => void;
};

type HandlePos = { x: number; y: number; h: number };

function edgeWordElements(root: HTMLElement, range: WordRange) {
  const { anchor, focus } = normalizeWordRange(range);
  let startEl: HTMLElement | null = null;
  let endEl: HTMLElement | null = null;
  const words = root.querySelectorAll<HTMLElement>('.verse-word');
  for (let i = 0; i < words.length; i++) {
    const el = words[i];
    const v = Number(el.dataset.v);
    const s = Number(el.dataset.s);
    const e = Number(el.dataset.e);
    if (v === anchor.verse && s === anchor.start) startEl = el;
    if (v === focus.verse && e === focus.end) endEl = el;
  }
  return { startEl, endEl };
}

export function ReaderSelectionHandles({ wordRange, contentRef, onRangeChange }: Props) {
  const [startPos, setStartPos] = useState<HandlePos | null>(null);
  const [endPos, setEndPos] = useState<HandlePos | null>(null);

  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) {
      setStartPos(null);
      setEndPos(null);
      return;
    }
    const place = () => {
      const { startEl, endEl } = edgeWordElements(root, wordRange);
      if (startEl) {
        const r = startEl.getBoundingClientRect();
        setStartPos({ x: r.left, y: r.top, h: r.height });
      } else setStartPos(null);
      if (endEl) {
        const r = endEl.getBoundingClientRect();
        setEndPos({ x: r.right, y: r.top, h: r.height });
      } else setEndPos(null);
    };
    place();
    const scrollEl = root.closest('.reader-scroll-panel, .reader-turn-panel-active') ?? root;
    scrollEl.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      scrollEl.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [wordRange, contentRef]);

  if (!startPos || !endPos) return null;

  const { anchor, focus } = normalizeWordRange(wordRange);

  const onHandlePointerDown = (side: 'start' | 'end') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const node = document.elementFromPoint(ev.clientX, ev.clientY);
      const w = node?.closest('.verse-word') as HTMLElement | null;
      if (!w) return;
      const hit: WordAnchor = {
        verse: Number(w.dataset.v),
        start: Number(w.dataset.s),
        end: Number(w.dataset.e),
      };
      if (side === 'start') onRangeChange(hit, focus);
      else onRangeChange(anchor, hit);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  return (
    <>
      <div
        className="reader-sel-handle reader-sel-handle-start"
        style={{ top: startPos.y, left: startPos.x - 6, height: startPos.h }}
        onPointerDown={onHandlePointerDown('start')}
        role="slider"
        aria-label="调整选区起点"
      />
      <div
        className="reader-sel-handle reader-sel-handle-end"
        style={{ top: endPos.y, left: endPos.x - 2, height: endPos.h }}
        onPointerDown={onHandlePointerDown('end')}
        role="slider"
        aria-label="调整选区终点"
      />
    </>
  );
}
