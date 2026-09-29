'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Verse } from '@/lib/api';
import { normalizeInlineRef } from '@/lib/inline_ref';
import { refToChineseLabel } from '@/lib/ref_label';
import AppBodyPortal from '@/components/AppBodyPortal';

const DISMISS_DY = 72;

type PreviewMode = 'range' | 'chapter';

type RefTarget = {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
};

function parseRefTarget(refParam: string): RefTarget | null {
  const raw = (normalizeInlineRef(refParam) || refParam).trim();
  const range = raw.match(/^([A-Za-z0-9]+)\.(\d+)\.(\d+)-(\d+)$/);
  if (range) {
    return {
      book: range[1].toUpperCase(),
      chapter: Number(range[2]),
      verseStart: Number(range[3]),
      verseEnd: Number(range[4]),
    };
  }
  const single = raw.match(/^([A-Za-z0-9]+)\.(\d+)\.(\d+)$/);
  if (single) {
    return {
      book: single[1].toUpperCase(),
      chapter: Number(single[2]),
      verseStart: Number(single[3]),
      verseEnd: Number(single[3]),
    };
  }
  const ch = raw.match(/^([A-Za-z0-9]+)\.(\d+)$/);
  if (ch) {
    return { book: ch[1].toUpperCase(), chapter: Number(ch[2]) };
  }
  return null;
}

function inFocusRange(verse: number, target: RefTarget | null): boolean {
  if (!target?.verseStart) return false;
  const end = target.verseEnd ?? target.verseStart;
  return verse >= target.verseStart && verse <= end;
}

export function VersePreviewSheet({
  refParam,
  refLabel,
  onClose,
}: {
  refParam: string;
  refLabel?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<PreviewMode>('range');
  const [verses, setVerses] = useState<Verse[]>([]);
  const [chapterVerses, setChapterVerses] = useState<Verse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLParagraphElement | null>(null);
  const dragRef = useRef<{ y: number; pulling: boolean; pointerId: number }>({
    y: 0,
    pulling: false,
    pointerId: -1,
  });
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef(0);
  const label = refLabel ?? refToChineseLabel(refParam) ?? refParam;
  const target = useMemo(() => parseRefTarget(refParam), [refParam]);
  const canExpandChapter = Boolean(target?.book && target.chapter > 0);

  useEffect(() => {
    dragOffsetRef.current = dragOffset;
  }, [dragOffset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setMode('range');
    setChapterVerses(null);
    void api
      .scriptureRef(refParam)
      .then((d) => {
        if (cancelled) return;
        setVerses(d.verses ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setErr('无法加载经文');
          setVerses([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refParam]);

  useEffect(() => {
    if (mode !== 'chapter' || !target || chapterVerses) return;
    let cancelled = false;
    setChapterLoading(true);
    void api
      .chapter(target.book, target.chapter)
      .then((d) => {
        if (cancelled) return;
        setChapterVerses(d.verses ?? []);
      })
      .catch(() => {
        if (!cancelled) setErr('无法加载整章');
      })
      .finally(() => {
        if (!cancelled) setChapterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, target, chapterVerses]);

  useEffect(() => {
    if (mode !== 'chapter' || chapterLoading) return;
    const id = window.setTimeout(() => {
      focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(id);
  }, [mode, chapterLoading, chapterVerses]);

  const resetDrag = useCallback(() => {
    setDragOffset(0);
    setIsDragging(false);
    dragRef.current = { y: 0, pulling: false, pointerId: -1 };
  }, []);

  const startDismissDrag = useCallback((clientY: number, pointerId: number) => {
    dragRef.current = { y: clientY, pulling: true, pointerId };
    setIsDragging(true);
    setDragOffset(0);
  }, []);

  const moveDismissDrag = useCallback((clientY: number, pointerId: number) => {
    const drag = dragRef.current;
    if (!drag.pulling || drag.pointerId !== pointerId) return;
    const dy = clientY - drag.y;
    if (dy > 0) setDragOffset(Math.min(dy, 220));
    else setDragOffset(0);
  }, []);

  const endDismissDrag = useCallback(
    (pointerId: number) => {
      const drag = dragRef.current;
      if (!drag.pulling || drag.pointerId !== pointerId) return;
      if (dragOffsetRef.current > DISMISS_DY) onClose();
      resetDrag();
    },
    [onClose, resetDrag],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => moveDismissDrag(e.clientY, e.pointerId);
    const onUp = (e: PointerEvent) => endDismissDrag(e.pointerId);
    const onCancel = (e: PointerEvent) => endDismissDrag(e.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [moveDismissDrag, endDismissDrag]);

  const displayVerses = mode === 'chapter' ? chapterVerses ?? verses : verses;
  const showChapterLoading = mode === 'chapter' && chapterLoading && !chapterVerses;
  const firstFocusVerse =
    mode === 'chapter' && target?.verseStart
      ? displayVerses.find((v) => inFocusRange(v.verse, target))?.verse
      : undefined;

  useEffect(() => {
    focusRef.current = null;
  }, [mode, refParam]);

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop shelf-verse-preview-backdrop" onClick={onClose}>
        <div
          className={`sheet card verse-preview-sheet shelf-verse-preview-sheet${mode === 'chapter' ? ' is-chapter' : ''}`}
          style={{
            transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
            transition: isDragging ? 'none' : 'transform 0.22s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="shelf-verse-preview-handle"
            onPointerDown={(e) => {
              e.stopPropagation();
              startDismissDrag(e.clientY, e.pointerId);
            }}
            aria-hidden
          />
          <div
            className="shelf-verse-preview-head"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              startDismissDrag(e.clientY, e.pointerId);
            }}
          >
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>{mode === 'chapter' ? `${label} · 整章` : label}</strong>
              <button type="button" className="text-link" onClick={onClose}>
                关闭
              </button>
            </div>
          </div>
          <div ref={scrollRef} className="verse-preview-scroll shelf-verse-preview-scroll">
            {(loading || showChapterLoading) && <p className="muted">加载中…</p>}
            {err && <p className="muted">{err}</p>}
            {!loading && !showChapterLoading && displayVerses.length > 0 && (
              <div className="verse-preview-list">
                {displayVerses.map((v) => {
                  const focused = mode === 'chapter' && inFocusRange(v.verse, target);
                  return (
                    <p
                      key={v.verse}
                      ref={v.verse === firstFocusVerse ? focusRef : undefined}
                      className={`verse-preview-line${focused ? ' is-focus' : ''}`}
                    >
                      <sup className="verse-preview-num">{v.verse}</sup>
                      {v.text}
                    </p>
                  );
                })}
              </div>
            )}
            {!loading && !showChapterLoading && !err && displayVerses.length === 0 && (
              <p className="muted">暂无经文</p>
            )}
          </div>
          {canExpandChapter && !loading && !showChapterLoading && displayVerses.length > 0 ? (
            <div className="shelf-verse-preview-footer">
              {mode === 'range' ? (
                <button
                  type="button"
                  className="text-link shelf-verse-preview-more"
                  onClick={() => setMode('chapter')}
                >
                  查看更多
                </button>
              ) : (
                <button
                  type="button"
                  className="text-link shelf-verse-preview-more"
                  onClick={() => setMode('range')}
                >
                  收起
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
