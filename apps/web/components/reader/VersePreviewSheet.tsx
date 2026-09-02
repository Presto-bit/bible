'use client';

import { useEffect, useRef, useState } from 'react';
import { api, type Verse } from '@/lib/api';
import { refToChineseLabel } from '@/lib/ref_label';
import AppBodyPortal from '@/components/AppBodyPortal';

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
  const dragRef = useRef<{ y: number; pulling: boolean }>({ y: 0, pulling: false });
  const [dragOffset, setDragOffset] = useState(0);
  const label = refLabel ?? refToChineseLabel(refParam) ?? refParam;

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

  const onHandleTouchStart = (e: React.TouchEvent) => {
    dragRef.current = { y: e.touches[0].clientY, pulling: true };
  };

  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current.pulling) return;
    const dy = e.touches[0].clientY - dragRef.current.y;
    if (dy > 0) setDragOffset(Math.min(dy, 160));
  };

  const onHandleTouchEnd = () => {
    if (dragOffset > 72) onClose();
    setDragOffset(0);
    dragRef.current.pulling = false;
  };

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop shelf-verse-preview-backdrop" onClick={onClose}>
        <div
          className="sheet card verse-preview-sheet shelf-verse-preview-sheet"
          style={{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="shelf-verse-preview-handle"
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}
            aria-hidden
          />
          <div className="section-row" style={{ marginTop: 0 }}>
            <strong>{label}</strong>
            <button type="button" className="text-link" onClick={onClose}>
              关闭
            </button>
          </div>
          <p className="muted shelf-verse-preview-hint">下滑关闭</p>
          <div className="verse-preview-scroll">
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
