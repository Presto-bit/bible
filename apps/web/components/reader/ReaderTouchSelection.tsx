'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { verseCharAtPoint } from '@/lib/native_verse_selection';
import { readerScrollEl } from '@/lib/reader_viewport';
import { caretWordAnchor, type WordAnchor, type WordRange } from '@/lib/selection_range';
import {
  boundsEmpty,
  selectionRects,
  selectionText,
  verseBody,
  wordRangeBounds,
  type SelRect,
} from '@/lib/touch_verse_selection';
import { wordContainingOffset } from '@/lib/verse_words';

const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE = 10;
const LOUPE_W = 132;
const LOUPE_H = 56;
const LOUPE_SCALE = 1.5;
const LOUPE_GAP = 36;
const EDGE_ZONE = 56;
const HANDLE_HIT = 22;

type Gesture =
  | { kind: 'press'; id: number; sx: number; sy: number; x: number; y: number; anchor: WordAnchor | null }
  | { kind: 'handle'; id: number; x: number; y: number; dx: number; dy: number; fixed: WordAnchor };

type Props = {
  rootRef: RefObject<HTMLElement | null>;
  /** 换章/换翻页容器时重置手势。 */
  rootKey: string;
  enabled: boolean;
  range: WordRange | null;
  onChange: (range: WordRange, text: string) => void;
  onCommit: () => void;
  onGestureChange: (active: boolean) => void;
  onDismiss: () => void;
  onRects?: (rects: SelRect[]) => void;
};

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i += 1) {
    if (list[i]!.identifier === id) return list[i]!;
  }
  return null;
}

function pointInRects(x: number, y: number, rects: SelRect[], pad = 6): boolean {
  return rects.some(
    (r) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad,
  );
}

/**
 * 触控/PWA 应用内选区（替代系统选区，避免 iOS 拷贝/查询菜单）：
 * 长按放大镜 → 不松手拖选 → 叠加层底色 + 两端手柄 → 松手交给彼爱工具条。
 */
export function ReaderTouchSelection({
  rootRef,
  rootKey,
  enabled,
  range,
  onChange,
  onCommit,
  onGestureChange,
  onDismiss,
  onRects,
}: Props) {
  const [liveRange, setLiveRange] = useState<WordRange | null>(null);
  const [rects, setRects] = useState<SelRect[]>([]);
  const displayRange = liveRange ?? range;

  const displayRangeRef = useRef(displayRange);
  displayRangeRef.current = displayRange;
  const liveRef = useRef<WordRange | null>(null);
  const rectsRef = useRef<SelRect[]>([]);
  const cbRef = useRef({ onChange, onCommit, onGestureChange, onDismiss, onRects });
  cbRef.current = { onChange, onCommit, onGestureChange, onDismiss, onRects };

  const loupeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const loupeTextRef = useRef<HTMLDivElement>(null);
  const loupeRectsRef = useRef<HTMLDivElement>(null);
  const loupeSourceRef = useRef<HTMLElement | null>(null);

  const publishRects = useCallback((next: SelRect[]) => {
    rectsRef.current = next;
    setRects(next);
    cbRef.current.onRects?.(next);
  }, []);

  const measure = useCallback(() => {
    const root = rootRef.current;
    const r = displayRangeRef.current;
    publishRects(root && r ? selectionRects(root, wordRangeBounds(r)) : []);
  }, [rootRef, publishRects]);

  useLayoutEffect(() => {
    measure();
  }, [displayRange, rootKey, measure]);

  useEffect(() => {
    if (!displayRange) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [displayRange, measure]);

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;

    let g: Gesture | null = null;
    let timer = 0;
    let raf = 0;
    let edgeRaf = 0;

    const setLive = (r: WordRange | null) => {
      liveRef.current = r;
      setLiveRange(r);
    };

    const emit = (r: WordRange) => {
      cbRef.current.onChange(r, selectionText(root, wordRangeBounds(r)));
    };

    const paint = (r: WordRange) => {
      publishRects(selectionRects(root, wordRangeBounds(r)));
    };

    const hideLoupe = () => {
      const loupe = loupeRef.current;
      if (loupe) loupe.style.opacity = '0';
      loupeSourceRef.current = null;
      loupeTextRef.current?.replaceChildren();
      loupeRectsRef.current?.replaceChildren();
    };

    const showLoupe = (px: number, py: number, verse: number) => {
      const loupe = loupeRef.current;
      const stage = stageRef.current;
      const text = loupeTextRef.current;
      const rectLayer = loupeRectsRef.current;
      if (!loupe || !stage || !text || !rectLayer) return;
      const anchorEl = root.querySelector(`#verse-anchor-${verse}`);
      const block = (anchorEl?.closest('.verse-paragraph') ?? anchorEl) as HTMLElement | null;
      if (!block) return;
      if (loupeSourceRef.current !== block) {
        loupeSourceRef.current = block;
        const clone = block.cloneNode(true) as HTMLElement;
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
        const cs = getComputedStyle(block);
        text.style.width = `${block.offsetWidth}px`;
        text.style.fontFamily = cs.fontFamily;
        text.style.fontSize = cs.fontSize;
        text.style.lineHeight = cs.lineHeight;
        text.style.letterSpacing = cs.letterSpacing;
        text.style.color = cs.color;
        text.replaceChildren(clone);
      }
      const br = block.getBoundingClientRect();
      rectLayer.replaceChildren(
        ...rectsRef.current.map((r) => {
          const d = document.createElement('div');
          d.style.left = `${r.left - br.left}px`;
          d.style.top = `${r.top - br.top}px`;
          d.style.width = `${r.right - r.left}px`;
          d.style.height = `${r.bottom - r.top}px`;
          return d;
        }),
      );
      const left = Math.max(4, Math.min(window.innerWidth - LOUPE_W - 4, px - LOUPE_W / 2));
      let top = py - LOUPE_GAP - LOUPE_H;
      if (top < 8) top = py + LOUPE_GAP;
      loupe.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      loupe.style.opacity = '1';
      const tx = LOUPE_W / 2 - (px - br.left) * LOUPE_SCALE;
      const ty = LOUPE_H / 2 - (py - br.top) * LOUPE_SCALE;
      stage.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${LOUPE_SCALE})`;
    };

    const pointOf = (cur: Gesture) =>
      cur.kind === 'handle' ? { x: cur.x + cur.dx, y: cur.y + cur.dy } : { x: cur.x, y: cur.y };

    const frame = () => {
      raf = 0;
      const cur = g;
      if (!cur || (cur.kind === 'press' && !cur.anchor)) return;
      const p = pointOf(cur);
      const hit = verseCharAtPoint(root, p.x, p.y);
      if (!hit) return;
      const caret = caretWordAnchor(hit.verse, hit.offset);
      const next: WordRange =
        cur.kind === 'press' ? { anchor: cur.anchor!, focus: caret } : { anchor: caret, focus: cur.fixed };
      if (!boundsEmpty(wordRangeBounds(next))) {
        setLive(next);
        paint(next);
      }
      showLoupe(p.x, p.y, hit.verse);
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const edgeLoop = () => {
      edgeRaf = 0;
      const cur = g;
      if (!cur || (cur.kind === 'press' && !cur.anchor)) return;
      const sc = readerScrollEl(root);
      const box = sc?.getBoundingClientRect();
      const top = box ? box.top : 0;
      const bottom = box ? box.bottom : window.innerHeight;
      const { y } = pointOf(cur);
      let dy = 0;
      if (y < top + EDGE_ZONE) dy = -Math.min(18, Math.ceil((top + EDGE_ZONE - y) / 4));
      else if (y > bottom - EDGE_ZONE) dy = Math.min(18, Math.ceil((y - (bottom - EDGE_ZONE)) / 4));
      if (dy) {
        if (sc) sc.scrollTop += dy;
        else window.scrollBy(0, dy);
        schedule();
      }
      edgeRaf = requestAnimationFrame(edgeLoop);
    };

    const begin = (kind: Gesture['kind']) => {
      document.body.classList.add(kind === 'press' ? 'reader-word-selecting' : 'reader-sel-handle-dragging');
      cbRef.current.onGestureChange(true);
      if (!edgeRaf) edgeRaf = requestAnimationFrame(edgeLoop);
    };

    const stopFrames = () => {
      window.clearTimeout(timer);
      timer = 0;
      if (raf) cancelAnimationFrame(raf);
      if (edgeRaf) cancelAnimationFrame(edgeRaf);
      raf = 0;
      edgeRaf = 0;
    };

    const end = (commit: boolean) => {
      stopFrames();
      document.body.classList.remove('reader-word-selecting', 'reader-sel-handle-dragging');
      hideLoupe();
      const r = liveRef.current;
      if (r && commit) emit(r);
      setLive(null);
      if (commit) cbRef.current.onCommit();
      cbRef.current.onGestureChange(false);
    };

    const arm = () => {
      timer = 0;
      const cur = g;
      if (!cur || cur.kind !== 'press') return;
      const hit = verseCharAtPoint(root, cur.sx, cur.sy);
      const full = hit ? verseBody(root, hit.verse)?.textContent ?? '' : '';
      const w = hit ? wordContainingOffset(full, hit.offset) : null;
      if (!hit || !w) {
        g = null;
        return;
      }
      const anchor: WordAnchor = { verse: hit.verse, start: w.start, end: w.end };
      cur.anchor = anchor;
      const r: WordRange = { anchor, focus: anchor };
      begin('press');
      setLive(r);
      emit(r);
      paint(r);
      showLoupe(cur.sx, cur.sy, hit.verse);
      try {
        navigator.vibrate?.(8);
      } catch {
        /* iOS 无 vibrate */
      }
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (g) {
          const wasActive = g.kind === 'handle' || g.anchor;
          g = null;
          if (wasActive) end(true);
          else stopFrames();
        }
        return;
      }
      const t = e.touches[0]!;
      const target = e.target as Element | null;
      const handle = target?.closest?.('.reader-sel-handle[data-edge]') as HTMLElement | null;
      const current = displayRangeRef.current;
      if (handle && current && rectsRef.current.length) {
        e.preventDefault();
        const b = wordRangeBounds(current);
        const list = rectsRef.current;
        const isStart = handle.dataset.edge === 'start';
        const edgeRect = isStart ? list[0]! : list[list.length - 1]!;
        const hx = isStart ? edgeRect.left : edgeRect.right;
        const hy = (edgeRect.top + edgeRect.bottom) / 2;
        g = {
          kind: 'handle',
          id: t.identifier,
          x: t.clientX,
          y: t.clientY,
          dx: hx - t.clientX,
          dy: hy - t.clientY,
          fixed: isStart ? caretWordAnchor(b.endVerse, b.endOff) : caretWordAnchor(b.startVerse, b.startOff),
        };
        setLive(current);
        begin('handle');
        schedule();
        return;
      }
      if (!target || !root.contains(target)) return;
      g = { kind: 'press', id: t.identifier, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY, anchor: null };
      timer = window.setTimeout(arm, LONG_PRESS_MS);
    };

    const onMove = (e: TouchEvent) => {
      const cur = g;
      if (!cur) return;
      const t = findTouch(e.touches, cur.id);
      if (!t) return;
      if (cur.kind === 'press' && !cur.anchor) {
        if (Math.hypot(t.clientX - cur.sx, t.clientY - cur.sy) > MOVE_TOLERANCE) {
          stopFrames();
          g = null;
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      cur.x = t.clientX;
      cur.y = t.clientY;
      schedule();
    };

    const onEnd = (e: TouchEvent) => {
      const cur = g;
      if (!cur) return;
      const t = findTouch(e.changedTouches, cur.id);
      if (!t) return;
      g = null;
      if (cur.kind === 'handle' || cur.anchor) {
        if (e.cancelable) e.preventDefault();
        end(true);
        return;
      }
      stopFrames();
      if (!displayRangeRef.current) return;
      const target = e.target as Element | null;
      if (!target || !root.contains(target)) return;
      if (target.closest('.proper-noun, [role="button"], button, a')) return;
      if (e.cancelable) e.preventDefault();
      if (pointInRects(t.clientX, t.clientY, rectsRef.current)) return;
      cbRef.current.onDismiss();
    };

    const onCancel = () => {
      const cur = g;
      g = null;
      if (cur && (cur.kind === 'handle' || cur.anchor)) end(true);
      else stopFrames();
    };

    const opts: AddEventListenerOptions = { capture: true, passive: false };
    document.addEventListener('touchstart', onStart, opts);
    document.addEventListener('touchmove', onMove, opts);
    document.addEventListener('touchend', onEnd, opts);
    document.addEventListener('touchcancel', onCancel, opts);
    return () => {
      document.removeEventListener('touchstart', onStart, opts);
      document.removeEventListener('touchmove', onMove, opts);
      document.removeEventListener('touchend', onEnd, opts);
      document.removeEventListener('touchcancel', onCancel, opts);
      const wasActive = g && (g.kind === 'handle' || g.anchor);
      g = null;
      if (wasActive) end(false);
      else stopFrames();
    };
  }, [enabled, rootKey, rootRef, publishRects]);

  const first = rects[0];
  const last = rects[rects.length - 1];
  const show = Boolean(displayRange && first && last);

  return (
    <>
      {show ? (
        <div className="reader-sel-layer" aria-hidden>
          {rects.map((r, i) => (
            <div
              key={i}
              className="reader-sel-rect"
              style={{ left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top }}
            />
          ))}
        </div>
      ) : null}
      {show && first && last ? (
        <>
          <div
            className="reader-sel-handle reader-sel-handle-start"
            data-edge="start"
            aria-hidden
            style={{ left: first.left, top: first.top - HANDLE_HIT, height: first.bottom - first.top + HANDLE_HIT * 2 }}
          />
          <div
            className="reader-sel-handle reader-sel-handle-end"
            data-edge="end"
            aria-hidden
            style={{ left: last.right, top: last.top - HANDLE_HIT, height: last.bottom - last.top + HANDLE_HIT * 2 }}
          />
        </>
      ) : null}
      <div ref={loupeRef} className="reader-loupe" aria-hidden>
        <div ref={stageRef} className="reader-loupe-stage">
          <div ref={loupeRectsRef} className="reader-loupe-rects" />
          <div ref={loupeTextRef} className="reader-loupe-text" />
        </div>
      </div>
    </>
  );
}
