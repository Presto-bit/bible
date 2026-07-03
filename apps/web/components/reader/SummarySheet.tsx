'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type GeoPlace, type TimelineChapter } from '@/lib/api';

function formatEra(timeline: TimelineChapter | null): string | null {
  if (!timeline) return null;
  return (
    timeline.year_display
    ?? timeline.era
    ?? (timeline.year != null
      ? (timeline.year < 0 ? `${Math.abs(timeline.year)} BC` : `${timeline.year} AD`)
      : null)
  );
}

export default function SummarySheet({
  title,
  load,
  bookId,
  chapter,
  onClose,
}: {
  title: string;
  load: () => Promise<string>;
  bookId?: string;
  chapter?: number;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [timeline, setTimeline] = useState<TimelineChapter | null>(null);
  const [places, setPlaces] = useState<GeoPlace[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setErr(null);
    void load()
      .then((t) => {
        if (!cancelled) setBody(t);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, title]);

  useEffect(() => {
    if (!bookId || chapter == null) {
      setTimeline(null);
      setPlaces([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      api.timeline(bookId, chapter),
      api.geography(undefined, bookId, chapter),
    ])
      .then(([tl, geo]) => {
        if (cancelled) return;
        setTimeline(tl.timeline ?? null);
        setPlaces(geo.places ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setTimeline(null);
          setPlaces([]);
        }
      });
    return () => { cancelled = true; };
  }, [bookId, chapter]);

  const eraLabel = formatEra(timeline);
  const showContext = chapter != null && (eraLabel || places.length > 0);

  const sheet = (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="half-sheet summary-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-head">
          <div className="half-sheet-grab" />
          <div className="half-sheet-title">
            <strong>{title}</strong>
            <button type="button" className="text-link" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="half-sheet-body">
          <span className="half-sheet-badge">小爱导读</span>
          {busy && !body && <p className="muted">小爱正在整理…</p>}
          {err && <p style={{ color: '#b1554a' }}>{err}</p>}
          {body && <p className="summary-sheet-body">{body}</p>}
          {showContext && (
            <div className="summary-sheet-context">
              <p className="summary-sheet-context-label">本章背景</p>
              {eraLabel && (
                <p className="summary-sheet-context-row">
                  <span aria-hidden>🕐</span> {eraLabel}
                </p>
              )}
              {places.length > 0 && (
                <div className="summary-sheet-places">
                  <span aria-hidden>📍</span>
                  {places.slice(0, 8).map((p) => (
                    <span key={p.id || p.name} className="reader-context-place-chip static">
                      {p.name}
                    </span>
                  ))}
                  {places.length > 8 && (
                    <span className="muted" style={{ fontSize: 12 }}>+{places.length - 8}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
