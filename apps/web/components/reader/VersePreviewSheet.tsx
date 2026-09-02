'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Verse } from '@/lib/api';
import { refToChineseLabel } from '@/lib/ref_label';
import AppBodyPortal from '@/components/AppBodyPortal';

const DISMISS_DY = 72;

export function VersePreviewSheet({
  refParam,
  refLabel,
  onClose,
}: {
  refParam: string;
  refLabel?: string;
  onClose: () => void;
}) {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; pulling: boolean; pointerId: number }>({
    y: 0,
    pulling: false,
    pointerId: -1,
  });
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef(0);
  const label = refLabel ?? refToChineseLabel(refParam) ?? refParam;

  useEffect(() => {
    dragOffsetRef.current = dragOffset;
  }, [dragOffset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
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

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop shelf-verse-preview-backdrop" onClick={onClose}>
        <div
          className="sheet card verse-preview-sheet shelf-verse-preview-sheet"
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
              <strong>{label}</strong>
              <button type="button" className="text-link" onClick={onClose}>
                关闭
              </button>
            </div>
            <p className="muted shelf-verse-preview-hint">上下滑动查看更多 · 拖顶栏下滑关闭</p>
          </div>
          <div ref={scrollRef} className="verse-preview-scroll shelf-verse-preview-scroll">
            {loading && <p className="muted">加载中…</p>}
            {err && <p className="muted">{err}</p>}
            {!loading && verses.length > 0 && (
              <div className="verse-preview-list">
                {verses.map((v) => (
                  <p key={v.verse} className="verse-preview-line">
                    <sup className="verse-preview-num">{v.verse}</sup>
                    {v.text}
                  </p>
                ))}
              </div>
            )}
            {!loading && !err && verses.length === 0 && <p className="muted">暂无经文</p>}
          </div>
        </div>
      </div>
    </AppBodyPortal>
  );
}
