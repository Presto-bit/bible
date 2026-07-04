'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type GeoPlace, type TimelineChapter } from '@/lib/api';
import { refSpaceToOsis } from '@/lib/inline_ref';

export function ReaderChapterContext({
  bookId,
  chapter,
  onPlaceRef,
}: {
  bookId: string;
  chapter: number;
  onPlaceRef?: (osis: string, label: string) => void;
}) {
  const [timeline, setTimeline] = useState<TimelineChapter | null>(null);
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [bookId, chapter]);

  if (loading) return null;
  if (!timeline && places.length === 0) return null;

  const eraLabel =
    timeline?.year_display
    ?? timeline?.era
    ?? (timeline?.year != null
      ? (timeline.year < 0 ? `${Math.abs(timeline.year)} BC` : `${timeline.year} AD`)
      : null);

  const pickPlaceRef = (p: GeoPlace): string | null => {
    const prefix = `${bookId.toUpperCase()} ${chapter}:`;
    const inChapter = (p.refs ?? []).find((r) => r.toUpperCase().startsWith(prefix));
    const raw = inChapter ?? p.refs?.[0];
    if (!raw) return null;
    return raw.includes('.') ? raw : refSpaceToOsis(raw);
  };

  return (
    <div className="reader-chapter-context" aria-label="本章背景">
      {eraLabel && (
        <span className="reader-context-era">
          <span className="reader-context-icon" aria-hidden>🕐</span>
          {eraLabel}
        </span>
      )}
      {places.length > 0 && (
        <div className="reader-context-places">
          <span className="reader-context-icon" aria-hidden>📍</span>
          {places.slice(0, 5).map((p) => {
            const ref = pickPlaceRef(p);
            return (
              <button
                key={p.id || p.name}
                type="button"
                className="reader-context-place-chip"
                disabled={!ref || !onPlaceRef}
                onClick={() => {
                  if (ref && onPlaceRef) onPlaceRef(ref, p.name);
                }}
              >
                {p.name}
              </button>
            );
          })}
          {places.length > 5 && (
            <span className="muted" style={{ fontSize: 11 }}>+{places.length - 5}</span>
          )}
        </div>
      )}
      <Link href="/search" className="reader-context-more muted">
        更多 ›
      </Link>
    </div>
  );
}
