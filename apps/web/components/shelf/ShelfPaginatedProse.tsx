'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import ShelfFocusBar from '@/components/shelf/ShelfFocusBar';
import { addThought } from '@/lib/reader_thoughts';
import {
  getHighlightMap,
  removeHighlight,
  setHighlight,
  type HighlightColor,
} from '@/lib/reader_highlights';
import { linkifyShelfProseHtml } from '@/lib/shelf_prose_html';
import {
  findShelfHighlightRef,
  paintShelfHighlights,
  pickShelfHighlight,
  shelfMarksForPage,
  supportsShelfCssHighlight,
} from '@/lib/shelf_highlight_paint';
import { buildShelfMarkRef } from '@/lib/shelf_mark_ref';
import { shelfThoughtSpansForPage } from '@/lib/shelf_annotations';
import {
  clearShelfTextSelection,
  readShelfTextSelection,
  type ShelfTextSelection,
} from '@/lib/shelf_selection';

const ThoughtWriteSheet = dynamic(
  () => import('@/components/reader/ThoughtWriteSheet').then((m) => m.default),
  { ssr: false },
);
const VersePreviewSheet = dynamic(
  () => import('@/components/reader/VersePreviewSheet').then((m) => m.VersePreviewSheet),
  { ssr: false },
);

type Props = {
  html: string;
  contentKey: string;
  bookId?: string;
  sectionId?: string;
  pageIndex?: number;
  scrollOffset?: number;
  scrollToEnd?: boolean;
  variant?: 'html' | 'docx';
  proseTone?: 'default' | 'lesson';
  onScrollProgress?: (ratio: number) => void;
  onTap?: () => void;
  chromeHidden?: boolean;
};

function focusBarStyleFromRect(rect: DOMRect, chromeHidden?: boolean): React.CSSProperties {
  const barH = 56;
  const margin = 12;
  const topReserve = chromeHidden ? 12 : 64;
  const bottomReserve = chromeHidden ? 24 : 72;
  let top = rect.bottom + margin;
  if (top + barH > window.innerHeight - bottomReserve) {
    top = rect.top - barH - margin;
  }
  top = Math.max(topReserve, Math.min(top, window.innerHeight - barH - bottomReserve));
  const left = Math.max(80, Math.min(rect.left + rect.width / 2, window.innerWidth - 80));
  return {
    top: `${top}px`,
    left: `${left}px`,
    bottom: 'auto',
    transform: 'translateX(-50%)',
  };
}

export default function ShelfPaginatedProse({
  html,
  contentKey,
  bookId,
  sectionId,
  pageIndex = 0,
  scrollOffset = 0,
  scrollToEnd = false,
  variant = 'html',
  proseTone = 'default',
  onScrollProgress,
  onTap,
  chromeHidden = false,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const syncRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const tapRef = useRef({ x: 0, y: 0, pointerId: -1, pointerType: 'mouse' as string });
  const tapTimerRef = useRef<number | null>(null);
  const TAP_SLOP_PX = 14;
  const [selection, setSelection] = useState<ShelfTextSelection | null>(null);
  const [markPaletteOpen, setMarkPaletteOpen] = useState(false);
  const [focusBarStyle, setFocusBarStyle] = useState<React.CSSProperties>({});
  const [highlightTick, setHighlightTick] = useState(0);
  const [versePreview, setVersePreview] = useState<{ osis: string; label: string } | null>(null);
  const [thoughtWrite, setThoughtWrite] = useState<{
    ref: string;
    label: string;
    verseText?: string;
  } | null>(null);

  const linkedHtml = useMemo(() => linkifyShelfProseHtml(html), [html]);
  const annotationsEnabled = Boolean(bookId && sectionId);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    syncRef.current = true;
    requestAnimationFrame(() => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (scrollToEnd) el.scrollTop = max;
      else if (scrollOffset > 0) el.scrollTop = scrollOffset * max;
      else el.scrollTop = 0;
      syncRef.current = false;
    });
  }, [contentKey, linkedHtml, scrollOffset, scrollToEnd]);

  const repaintHighlights = useCallback(() => {
    if (!annotationsEnabled || !articleRef.current || !supportsShelfCssHighlight()) return;
    const map = getHighlightMap();
    const marks = shelfMarksForPage(bookId!, sectionId!, pageIndex, map);
    const thoughtSpans = shelfThoughtSpansForPage(bookId!, sectionId!, pageIndex);
    paintShelfHighlights(articleRef.current, marks, thoughtSpans);
  }, [annotationsEnabled, bookId, sectionId, pageIndex, highlightTick]);

  useEffect(() => {
    repaintHighlights();
    return () => {
      if (supportsShelfCssHighlight()) {
        paintShelfHighlights(null, [], []);
      }
    };
  }, [linkedHtml, contentKey, repaintHighlights]);

  const syncSelection = useCallback(() => {
    const article = articleRef.current;
    const sel = readShelfTextSelection(article);
    setSelection(sel);
    if (sel) {
      setFocusBarStyle(focusBarStyleFromRect(sel.rect, chromeHidden));
    } else {
      setMarkPaletteOpen(false);
      setFocusBarStyle({});
    }
  }, [chromeHidden]);

  useEffect(() => {
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [syncSelection]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const onEnd = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => syncSelection());
      });
    };
    article.addEventListener('mouseup', onEnd);
    article.addEventListener('touchend', onEnd);
    return () => {
      article.removeEventListener('mouseup', onEnd);
      article.removeEventListener('touchend', onEnd);
    };
  }, [syncSelection, linkedHtml, contentKey]);

  useEffect(() => {
    if (selection) syncSelection();
  }, [chromeHidden, selection, syncSelection]);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = viewportRef.current;
      if (!el || syncRef.current) return;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      onScrollProgress?.(max > 0 ? el.scrollTop / max : 0);
      if (selection) syncSelection();
    });
  }, [onScrollProgress, selection, syncSelection]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const clearSelection = useCallback(() => {
    clearShelfTextSelection();
    setSelection(null);
    setMarkPaletteOpen(false);
    setFocusBarStyle({});
  }, []);

  const currentMarkRef = useMemo(() => {
    if (!selection || !annotationsEnabled) return null;
    const map = getHighlightMap();
    return findShelfHighlightRef(
      bookId!,
      sectionId!,
      pageIndex,
      { start: selection.start, end: selection.end },
      map,
    );
  }, [selection, annotationsEnabled, bookId, sectionId, pageIndex, highlightTick]);

  const currentMarkColor = currentMarkRef ? getHighlightMap()[currentMarkRef]?.color ?? null : null;

  const onPickColor = useCallback(
    (color: HighlightColor) => {
      if (!selection || !annotationsEnabled) return;
      const ref = buildShelfMarkRef(bookId!, sectionId!, pageIndex, {
        start: selection.start,
        end: selection.end,
      });
      const map = getHighlightMap();
      pickShelfHighlight(ref, color, map, setHighlight, removeHighlight);
      setHighlightTick((n) => n + 1);
      setMarkPaletteOpen(false);
      clearSelection();
    },
    [selection, annotationsEnabled, bookId, sectionId, pageIndex, clearSelection],
  );

  const onToggleMark = useCallback(() => {
    if (currentMarkRef) {
      removeHighlight(currentMarkRef);
      setHighlightTick((n) => n + 1);
      clearSelection();
      return;
    }
    setMarkPaletteOpen((v) => !v);
  }, [currentMarkRef, clearSelection]);

  const onCopy = useCallback(async () => {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.text);
    } catch {
      /* ignore */
    }
    clearSelection();
  }, [selection, clearSelection]);

  const onNote = useCallback(() => {
    if (!selection || !annotationsEnabled) return;
    const ref = buildShelfMarkRef(bookId!, sectionId!, pageIndex, {
      start: selection.start,
      end: selection.end,
    });
    setThoughtWrite({ ref, label: '书架笔记', verseText: selection.text });
    clearSelection();
  }, [selection, annotationsEnabled, bookId, sectionId, pageIndex, clearSelection]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current != null) window.clearTimeout(tapTimerRef.current);
    };
  }, []);

  const resolveTapOrSelection = useCallback(() => {
    const article = articleRef.current;
    const picked = readShelfTextSelection(article);
    if (picked) {
      setSelection(picked);
      setFocusBarStyle(focusBarStyleFromRect(picked.rect, chromeHidden));
      return;
    }
    const liveSel = window.getSelection();
    if (liveSel && !liveSel.isCollapsed && liveSel.toString().trim()) {
      syncSelection();
      return;
    }
    if (selection) {
      clearSelection();
      return;
    }
    onTap?.();
  }, [onTap, selection, clearSelection, syncSelection, chromeHidden]);

  const handleContentPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (tapTimerRef.current != null) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
    tapRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, pointerType: e.pointerType };
  }, []);

  const handleContentPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerId !== tapRef.current.pointerId) return;
      const target = e.target as HTMLElement;
      const btn = target.closest('.shelf-inline-ref') as HTMLElement | null;
      if (btn?.dataset.osis) return;

      const moved = Math.hypot(e.clientX - tapRef.current.x, e.clientY - tapRef.current.y);
      const isTouch = tapRef.current.pointerType === 'touch';
      const delay = isTouch ? 420 : 0;

      const run = () => {
        tapTimerRef.current = null;
        if (!isTouch && moved > TAP_SLOP_PX) {
          const picked = readShelfTextSelection(articleRef.current);
          if (!picked) return;
        }
        resolveTapOrSelection();
      };

      if (delay > 0) {
        tapTimerRef.current = window.setTimeout(run, delay);
      } else {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(run);
        });
      }
    },
    [resolveTapOrSelection],
  );

  const handleInlineRefClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.shelf-inline-ref') as HTMLElement | null;
      if (!btn?.dataset.osis) return;
      e.preventDefault();
      e.stopPropagation();
      setVersePreview({
        osis: btn.dataset.osis,
        label: btn.dataset.label || btn.textContent || '',
      });
    },
    [],
  );

  const proseClass =
    variant === 'docx'
      ? `shelf-docx-prose${proseTone === 'lesson' ? ' shelf-docx-prose-lesson' : ''}`
      : 'shelf-prose';

  return (
    <>
      <div
        ref={viewportRef}
        className="shelf-flow-viewport shelf-flow-viewport-annotated shelf-content-tap"
        onScroll={handleScroll}
        onPointerDown={handleContentPointerDown}
        onPointerUp={handleContentPointerUp}
      >
        <article
          ref={articleRef}
          className={`shelf-flow-article ${proseClass}`}
          dangerouslySetInnerHTML={{ __html: linkedHtml }}
          onClick={handleInlineRefClick}
        />
        <div className="shelf-flow-bottom-spacer" aria-hidden />
      </div>

      {selection && annotationsEnabled ? (
        <AppBodyPortal>
          <ShelfFocusBar
            style={focusBarStyle}
            markPaletteOpen={markPaletteOpen}
            currentMark={currentMarkColor}
            onNote={onNote}
            onToggleMark={onToggleMark}
            onPickColor={onPickColor}
            onCopy={onCopy}
          />
        </AppBodyPortal>
      ) : null}

      {versePreview ? (
        <VersePreviewSheet
          refParam={versePreview.osis}
          refLabel={versePreview.label}
          onClose={() => setVersePreview(null)}
        />
      ) : null}

      {thoughtWrite ? (
        <ThoughtWriteSheet
          mode="new"
          refStr={thoughtWrite.ref}
          refLabel={thoughtWrite.label}
          verseText={thoughtWrite.verseText}
          onSave={(body, visibility) => {
            addThought(thoughtWrite.ref, body, visibility);
            setHighlightTick((n) => n + 1);
            setThoughtWrite(null);
          }}
          onClose={() => setThoughtWrite(null)}
        />
      ) : null}
    </>
  );
}
