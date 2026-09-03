'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, memo, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import ShelfFocusBar from '@/components/shelf/ShelfFocusBar';
import { addThought } from '@/lib/reader_thoughts';
import { createShelfPost, type ShelfPost, type ShelfPostVisibility } from '@/lib/shelf_posts';
import {
  getHighlightMap,
} from '@/lib/reader_highlights';
import { rewriteShelfHtmlAssetUrls } from '@/lib/shelf_api';
import { linkifyShelfProseHtml, shelfParagraphIndexForRatio, shelfRatioForParagraphIndex } from '@/lib/shelf_prose_html';
import {
  clearShelfActiveSelection,
  clearShelfPinnedSelectionDom,
  paintShelfActiveSelection,
  paintShelfHighlights,
  pinShelfActiveSelectionDom,
  shelfMarksForPage,
  supportsShelfCssHighlight,
} from '@/lib/shelf_highlight_paint';
import { buildShelfMarkRef, parseShelfMarkRef } from '@/lib/shelf_mark_ref';
import { shelfThoughtSpansForPage } from '@/lib/shelf_annotations';
import {
  clearShelfTextSelection,
  readShelfTextSelection,
  type ShelfTextSelection,
} from '@/lib/shelf_selection';

const ShelfPostWriteSheet = dynamic(
  () => import('@/components/shelf/ShelfPostWriteSheet'),
  { ssr: false },
);
const ShelfNoteHubSheet = dynamic(
  () => import('@/components/shelf/ShelfNoteHubSheet'),
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
  scrollAnchor?: { paragraphIndex: number };
  scrollToEnd?: boolean;
  /** 切章/翻页时递增，驱动滚动定位（勿随阅读进度变化） */
  scrollSnapKey?: number;
  variant?: 'html' | 'docx';
  proseTone?: 'default' | 'lesson';
  onScrollProgress?: (ratio: number) => void;
  onScrollAnchor?: (anchor: { paragraphIndex: number }) => void;
  onTap?: () => void;
  chromeHidden?: boolean;
  onTextSelectionChange?: (active: boolean) => void;
  publicNotes?: ShelfPost[];
  onPublicNotesChanged?: () => void;
};

function offsetAtPoint(article: HTMLElement, x: number, y: number): number | null {
  const doc = article.ownerDocument;
  let range: Range | null = null;
  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(x, y);
  } else {
    const pos = (
      doc as Document & {
        caretPositionFromPoint?: (px: number, py: number) => { offsetNode: Node; offset: number } | null;
      }
    ).caretPositionFromPoint?.(x, y);
    if (pos) {
      range = doc.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (!range || !article.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(article);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function findPublicNoteAtOffset(notes: ShelfPost[], offset: number): ShelfPost | null {
  for (const n of notes) {
    if (n.span_start == null || n.span_end == null) continue;
    if (offset >= n.span_start && offset < n.span_end) return n;
  }
  return null;
}

function readSafeTopPx(): number {
  if (typeof window === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function focusBarStyleFromRect(rect: DOMRect, chromeHidden?: boolean): React.CSSProperties {
  const barH = 96;
  const margin = 10;
  const topReserve = chromeHidden ? readSafeTopPx() + 8 : 64;
  const bottomReserve = chromeHidden ? readSafeTopPx() + 24 : 72;
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
  scrollAnchor,
  scrollToEnd = false,
  scrollSnapKey = 0,
  variant = 'html',
  proseTone = 'default',
  onScrollProgress,
  onScrollAnchor,
  onTap,
  chromeHidden = false,
  onTextSelectionChange,
  publicNotes = [],
  onPublicNotesChanged,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const syncRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const tapRef = useRef({ x: 0, y: 0, t: 0, pointerId: -1, pointerType: 'mouse' as string });
  const tapTimerRef = useRef<number | null>(null);
  const TAP_SLOP_PX = 14;
  const [selection, setSelection] = useState<ShelfTextSelection | null>(null);
  const [focusBarStyle, setFocusBarStyle] = useState<React.CSSProperties>({});
  const [highlightTick, setHighlightTick] = useState(0);
  const [versePreview, setVersePreview] = useState<{ osis: string; label: string } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [thoughtWrite, setThoughtWrite] = useState<{
    ref: string;
    label: string;
    verseText?: string;
  } | null>(null);
  const [hubPostId, setHubPostId] = useState<string | null>(null);
  const [hubAbstract, setHubAbstract] = useState<string | undefined>();

  const publicNoteSpans = useMemo(
    () =>
      publicNotes
        .filter((n) => n.span_start != null && n.span_end != null)
        .map((n) => ({ start: n.span_start!, end: n.span_end! })),
    [publicNotes],
  );

  const linkedHtml = useMemo(
    () => linkifyShelfProseHtml(rewriteShelfHtmlAssetUrls(html, bookId)),
    [html, bookId],
  );
  const annotationsEnabled = Boolean(bookId && sectionId);

  const scrollApplyKeyRef = useRef('');
  const pendingScrollRef = useRef({ offset: scrollOffset, anchor: scrollAnchor, toEnd: scrollToEnd });

  useEffect(() => {
    pendingScrollRef.current = { offset: scrollOffset, anchor: scrollAnchor, toEnd: scrollToEnd };
  }, [contentKey, scrollOffset, scrollAnchor, scrollToEnd]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const key = `${contentKey}:${scrollSnapKey}:${scrollToEnd ? 'end' : 'start'}`;
    if (scrollApplyKeyRef.current === key) return;
    scrollApplyKeyRef.current = key;
    syncRef.current = true;
    const { offset, anchor, toEnd } = pendingScrollRef.current;
    requestAnimationFrame(() => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (toEnd) el.scrollTop = max;
      else if (anchor && linkedHtml) {
        const ratio = shelfRatioForParagraphIndex(linkedHtml, anchor.paragraphIndex);
        el.scrollTop = ratio * max;
      } else if (offset > 0) el.scrollTop = offset * max;
      else el.scrollTop = 0;
      syncRef.current = false;
    });
  }, [contentKey, linkedHtml, scrollToEnd, scrollSnapKey]);

  const repaintHighlights = useCallback(() => {
    if (!annotationsEnabled || !articleRef.current || !supportsShelfCssHighlight()) return;
    const map = getHighlightMap();
    const marks = shelfMarksForPage(bookId!, sectionId!, pageIndex, map);
    const thoughtSpans = shelfThoughtSpansForPage(bookId!, sectionId!, pageIndex);
    paintShelfHighlights(articleRef.current, marks, thoughtSpans, publicNoteSpans);
  }, [annotationsEnabled, bookId, sectionId, pageIndex, highlightTick, publicNoteSpans]);

  useEffect(() => {
    repaintHighlights();
    return () => {
      if (supportsShelfCssHighlight()) {
        paintShelfHighlights(null, [], []);
      }
    };
  }, [linkedHtml, contentKey, repaintHighlights]);

  const collapseNativeSelection = useCallback((sel: ShelfTextSelection) => {
    const article = articleRef.current;
    if (!article) return;
    const cssPainted = paintShelfActiveSelection(article, sel.start, sel.end);
    const domPinned = pinShelfActiveSelectionDom(article, sel.start, sel.end);
    if (!cssPainted && !domPinned) return;
    article.classList.add('shelf-sel-locked');
    setSelection(sel);
    clearShelfTextSelection();
    window.requestAnimationFrame(() => {
      clearShelfTextSelection();
      window.setTimeout(clearShelfTextSelection, 30);
    });
  }, []);

  const syncSelection = useCallback(() => {
    const article = articleRef.current;
    if (article?.classList.contains('shelf-sel-locked')) return;
    const sel = readShelfTextSelection(article);
    setSelection(sel);
    onTextSelectionChange?.(Boolean(sel));
    if (sel) {
      if (tapTimerRef.current != null) {
        window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      setFocusBarStyle(focusBarStyleFromRect(sel.rect, chromeHidden));
    } else {
      setFocusBarStyle({});
      clearShelfActiveSelection();
    }
  }, [chromeHidden, onTextSelectionChange]);

  const finalizeSelection = useCallback(() => {
    const article = articleRef.current;
    const sel = readShelfTextSelection(article);
    if (!sel) {
      syncSelection();
      return;
    }
    setSelection(sel);
    onTextSelectionChange?.(true);
    setFocusBarStyle(focusBarStyleFromRect(sel.rect, chromeHidden));
    collapseNativeSelection(sel);
  }, [chromeHidden, collapseNativeSelection, onTextSelectionChange, syncSelection]);

  useEffect(() => {
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [syncSelection]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const onEnd = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => finalizeSelection());
      });
    };
    article.addEventListener('mouseup', onEnd);
    article.addEventListener('touchend', onEnd);
    return () => {
      article.removeEventListener('mouseup', onEnd);
      article.removeEventListener('touchend', onEnd);
    };
  }, [finalizeSelection, linkedHtml, contentKey]);

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
      const ratio = max > 0 ? el.scrollTop / max : 0;
      onScrollProgress?.(ratio);
      onScrollAnchor?.({ paragraphIndex: shelfParagraphIndexForRatio(linkedHtml, ratio) });
      if (selection) {
        window.requestAnimationFrame(() => syncSelection());
      }
    });
  }, [onScrollProgress, onScrollAnchor, linkedHtml, selection, syncSelection]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const clearSelection = useCallback(() => {
    clearShelfTextSelection();
    const article = articleRef.current;
    article?.classList.remove('shelf-sel-locked');
    clearShelfActiveSelection();
    if (article) clearShelfPinnedSelectionDom(article);
    setSelection(null);
    setFocusBarStyle({});
    onTextSelectionChange?.(false);
  }, [onTextSelectionChange]);

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
    const snap = selection;
    const ref = buildShelfMarkRef(bookId!, sectionId!, pageIndex, {
      start: snap.start,
      end: snap.end,
    });
    const article = articleRef.current;
    article?.classList.remove('shelf-sel-locked');
    clearShelfActiveSelection();
    if (article) clearShelfPinnedSelectionDom(article);
    setThoughtWrite({ ref, label: '书架笔记', verseText: snap.text });
    setSelection(null);
    setFocusBarStyle({});
    onTextSelectionChange?.(false);
  }, [selection, annotationsEnabled, bookId, sectionId, pageIndex, onTextSelectionChange]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const blockMenu = (e: Event) => {
      if (article.classList.contains('shelf-sel-locked')) e.preventDefault();
    };
    article.addEventListener('contextmenu', blockMenu);
    return () => article.removeEventListener('contextmenu', blockMenu);
  }, [linkedHtml, contentKey]);

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
      onTextSelectionChange?.(true);
      setFocusBarStyle(focusBarStyleFromRect(picked.rect, chromeHidden));
      return;
    }
    const liveSel = window.getSelection();
    if (liveSel && !liveSel.isCollapsed && liveSel.toString().trim()) {
      syncSelection();
      return;
    }
    if (selection) return;
    onTap?.();
  }, [onTap, selection, syncSelection, chromeHidden, onTextSelectionChange]);

  const dismissSelectionIfBlankTap = useCallback(
    (clientX: number, clientY: number) => {
      if (!selection) return;
      const hit = document.elementFromPoint(clientX, clientY);
      if (hit?.closest('.shelf-focus-bar, .reader-focus-bar, .shelf-inline-ref')) return;
      if (articleRef.current?.contains(hit)) {
        const picked = readShelfTextSelection(articleRef.current);
        if (picked) return;
      }
      clearSelection();
    },
    [selection, clearSelection],
  );

  const handleContentPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (tapTimerRef.current != null) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
    tapRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), pointerId: e.pointerId, pointerType: e.pointerType };
  }, []);

  const handleContentPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerId !== tapRef.current.pointerId) return;
      const target = e.target as HTMLElement;
      if (target.closest('.shelf-focus-bar, .reader-focus-bar')) return;
      const galleryImg = target.closest('.shelf-docx-gallery img, img.shelf-docx-img') as HTMLImageElement | null;
      if (galleryImg?.src && galleryImg.closest('.shelf-docx-gallery')) {
        setLightboxSrc(galleryImg.currentSrc || galleryImg.src);
        return;
      }
      const btn = target.closest('.shelf-inline-ref') as HTMLElement | null;
      if (btn?.dataset.osis) return;

      const moved = Math.hypot(e.clientX - tapRef.current.x, e.clientY - tapRef.current.y);
      const held = Date.now() - tapRef.current.t;
      const isTouch = tapRef.current.pointerType === 'touch';
      const longPress = held >= 400;

      const run = () => {
        tapTimerRef.current = null;
        if (document.elementFromPoint(e.clientX, e.clientY)?.closest('.shelf-focus-bar, .reader-focus-bar')) {
          return;
        }
        const picked = readShelfTextSelection(articleRef.current);
        if (picked) {
          setSelection(picked);
          onTextSelectionChange?.(true);
          setFocusBarStyle(focusBarStyleFromRect(picked.rect, chromeHidden));
          collapseNativeSelection(picked);
          return;
        }
        if (longPress) return;
        if (!isTouch && moved > TAP_SLOP_PX) {
          dismissSelectionIfBlankTap(e.clientX, e.clientY);
          return;
        }
        if (selection && moved <= TAP_SLOP_PX) {
          dismissSelectionIfBlankTap(e.clientX, e.clientY);
          return;
        }
        const article = articleRef.current;
        if (article && publicNotes.length) {
          const offset = offsetAtPoint(article, e.clientX, e.clientY);
          if (offset != null) {
            const hit = findPublicNoteAtOffset(publicNotes, offset);
            if (hit) {
              setHubAbstract(hit.abstract ?? undefined);
              setHubPostId(hit.id);
              return;
            }
          }
        }
        resolveTapOrSelection();
      };

      const delay = longPress ? 80 : isTouch ? 160 : 0;

      if (delay > 0) {
        tapTimerRef.current = window.setTimeout(run, delay);
      } else {
        window.requestAnimationFrame(run);
      }
    },
    [resolveTapOrSelection, dismissSelectionIfBlankTap, selection, chromeHidden, onTextSelectionChange, publicNotes, collapseNativeSelection],
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

  const isDocxLike =
    variant === 'docx' ||
    linkedHtml.includes('shelf-docx-root') ||
    linkedHtml.includes('shelf-epub-root');
  const proseClass = isDocxLike
      ? `shelf-docx-prose${proseTone === 'lesson' ? ' shelf-docx-prose-lesson' : ''}${
          linkedHtml.includes('shelf-epub-root') ? ' shelf-epub-prose' : ''
        }`
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
        <ShelfProseArticle
          articleRef={articleRef}
          className={`shelf-flow-article ${proseClass}`}
          html={linkedHtml}
          onClick={handleInlineRefClick}
        />
        <div className="shelf-flow-bottom-spacer" aria-hidden />
      </div>

      {lightboxSrc ? (
        <AppBodyPortal>
          <button
            type="button"
            className="shelf-img-lightbox"
            aria-label="关闭图片"
            onClick={() => setLightboxSrc(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxSrc} alt="" />
          </button>
        </AppBodyPortal>
      ) : null}

      {selection && annotationsEnabled ? (
        <AppBodyPortal>
          <ShelfFocusBar
            style={focusBarStyle}
            onNote={onNote}
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
        <ShelfPostWriteSheet
          title="写笔记"
          contextLabel={thoughtWrite.label}
          contextBody={thoughtWrite.verseText}
          placeholder="写下这段文字给你的启发…"
          kind="note"
          onSave={(body, visibility) => {
            const parsed = parseShelfMarkRef(thoughtWrite.ref);
            void (async () => {
              try {
                await createShelfPost(bookId!, {
                  kind: 'note',
                  ref: thoughtWrite.ref,
                  body,
                  visibility,
                  section_id: sectionId,
                  page_index: pageIndex,
                  span_start: parsed?.spanStart,
                  span_end: parsed?.spanEnd,
                });
                addThought(thoughtWrite.ref, body, visibility);
                const article = articleRef.current;
                if (article) clearShelfPinnedSelectionDom(article);
                clearShelfActiveSelection();
                setHighlightTick((n) => n + 1);
                onPublicNotesChanged?.();
                setThoughtWrite(null);
              } catch {
                addThought(thoughtWrite.ref, body, visibility);
                const article = articleRef.current;
                if (article) clearShelfPinnedSelectionDom(article);
                clearShelfActiveSelection();
                setHighlightTick((n) => n + 1);
                setThoughtWrite(null);
              }
            })();
          }}
          onClose={() => {
            const article = articleRef.current;
            if (article) clearShelfPinnedSelectionDom(article);
            clearShelfActiveSelection();
            setThoughtWrite(null);
          }}
        />
      ) : null}

      {hubPostId && bookId ? (
        <ShelfNoteHubSheet
          bookId={bookId}
          postId={hubPostId}
          abstract={hubAbstract}
          onClose={() => {
            setHubPostId(null);
            setHubAbstract(undefined);
          }}
          onChanged={onPublicNotesChanged}
        />
      ) : null}
    </>
  );
}

const ShelfProseArticle = memo(function ShelfProseArticle({
  html,
  className,
  onClick,
  articleRef,
}: {
  html: string;
  className: string;
  onClick: (e: MouseEvent<HTMLElement>) => void;
  articleRef: RefObject<HTMLElement | null>;
}) {
  return (
    <article
      ref={articleRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onClick}
    />
  );
});
