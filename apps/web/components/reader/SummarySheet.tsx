'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import AnswerText from '@/components/AnswerText';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type GeoPlace, type TimelineChapter } from '@/lib/api';
import { loadBookSummary, loadChapterSummary } from '@/lib/bible_summary';

type SummaryTab = 'chapter' | 'book';

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
  bookId,
  bookName,
  chapter,
  englishUI = false,
  initialTab = 'chapter',
  onClose,
}: {
  bookId: string;
  bookName: string;
  chapter: number;
  englishUI?: boolean;
  initialTab?: SummaryTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SummaryTab>(initialTab);
  const [chapterBody, setChapterBody] = useState('');
  const [bookBody, setBookBody] = useState('');
  const [chapterBusy, setChapterBusy] = useState(true);
  const [bookBusy, setBookBusy] = useState(true);
  const [chapterErr, setChapterErr] = useState<string | null>(null);
  const [bookErr, setBookErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [timeline, setTimeline] = useState<TimelineChapter | null>(null);
  const [places, setPlaces] = useState<GeoPlace[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    setChapterBusy(true);
    setChapterErr(null);
    void loadChapterSummary(bookId, bookName, chapter)
      .then((t) => {
        if (!cancelled) setChapterBody(t);
      })
      .catch((e) => {
        if (!cancelled) setChapterErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setChapterBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, bookName, chapter]);

  useEffect(() => {
    let cancelled = false;
    setBookBusy(true);
    setBookErr(null);
    void loadBookSummary(bookId, bookName)
      .then((t) => {
        if (!cancelled) setBookBody(t);
      })
      .catch((e) => {
        if (!cancelled) setBookErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setBookBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, bookName]);

  useEffect(() => {
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
  const showContext = tab === 'chapter' && (eraLabel || places.length > 0);
  const chapterTitle = englishUI ? `Chapter ${chapter}` : `第 ${chapter} 章`;
  const activeBusy = tab === 'chapter' ? chapterBusy : bookBusy;
  const activeErr = tab === 'chapter' ? chapterErr : bookErr;
  const activeBody = tab === 'chapter' ? chapterBody : bookBody;

  const sheet = (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="half-sheet summary-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-head">
          <div className="half-sheet-grab" />
          <div className="half-sheet-title">
            <strong>{bookName}</strong>
            <SheetCloseButton onClick={onClose} />
          </div>
        </div>
        <div className="half-sheet-body">
          <div className="summary-sheet-tabs" role="tablist" aria-label="概览类型">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chapter'}
              className={`summary-sheet-tab${tab === 'chapter' ? ' is-active' : ''}`}
              onClick={() => setTab('chapter')}
            >
              {chapterTitle}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'book'}
              className={`summary-sheet-tab${tab === 'book' ? ' is-active' : ''}`}
              onClick={() => setTab('book')}
            >
              {englishUI ? 'Whole book' : '整卷概览'}
            </button>
          </div>
          <span className="half-sheet-badge">小爱导读</span>
          {activeBusy && !activeBody && <p className="muted">小爱正在整理…</p>}
          {activeErr && <p style={{ color: '#b1554a' }}>{activeErr}</p>}
          {activeBody && (
            <div className="summary-sheet-body">
              <AnswerText text={activeBody} dense />
            </div>
          )}
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
