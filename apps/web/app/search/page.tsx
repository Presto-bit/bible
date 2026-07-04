'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  type BibleSearchHit,
  type MapTour,
  type TimelineTour,
} from '@/lib/api';
import { bibleSearch } from '@/lib/bible_client';
import { listNotes, type LocalNote } from '@/lib/notes';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { LIFE_TOPICS } from '@/lib/discover_topics';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';

const HISTORY_KEY = 'search_history';

function searchTooShort(q: string): boolean {
  const hasCjk = /[\u4e00-\u9fff]/.test(q);
  return q.length < (hasCjk ? 1 : 2);
}

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function saveHistory(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return;
  const prev = loadHistory();
  const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export default function SearchPage() {
  const router = useRouter();
  const [backHref, setBackHref] = useState('/reader');
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hits, setHits] = useState<BibleSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [mapTours, setMapTours] = useState<MapTour[]>([]);
  const [timelineTours, setTimelineTours] = useState<TimelineTour[]>([]);
  const [toursReady, setToursReady] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    setNotes(listNotes());
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    if (from) setBackHref(from);
    const q = (params.get('q') || '').trim();
    if (q) {
      setQuery(q);
      const next = saveHistory(q);
      if (next) setHistory(next);
    }
    void Promise.all([
      api.mapTours().then((d) => setMapTours(d.tours ?? [])).catch(() => setMapTours([])),
      api.timelineTours().then((d) => setTimelineTours(d.tours ?? [])).catch(() => setTimelineTours([])),
    ]).finally(() => setToursReady(true));
  }, []);

  const noteHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (searchTooShort(q)) return [];
    return notes
      .filter(
        (n) =>
          n.body.toLowerCase().includes(q) ||
          (n.ref || '').toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [notes, query]);

  useEffect(() => {
    const q = query.trim();
    if (searchTooShort(q)) {
      setHits([]);
      setErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    bibleSearch(q)
      .then((rows) => {
        if (!cancelled) setHits(rows);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const onSubmit = (q: string) => {
    const next = saveHistory(q);
    if (next) setHistory(next);
  };

  const applyHistoryQuery = (name: string) => {
    setQuery(name);
    onSubmit(name);
  };

  const openReader = (hit: BibleSearchHit) => {
    onSubmit(query);
    window.location.href = `/reader?book=${encodeURIComponent(hit.book)}&chapter=${hit.chapter}`;
  };

  const openAssistant = (hit: BibleSearchHit) => {
    onSubmit(query);
    const snippet = hit.text.length > 24 ? `${hit.text.slice(0, 24)}…` : hit.text;
    navigateToAssistant(hit.osis, { question: `请解释：${snippet}` });
  };

  const hasQuery = !searchTooShort(query.trim());

  const openRef = (ref: string) => {
    setPreview({
      osis: refSpaceToOsis(ref.replace(/\./g, ' ')),
      label: formatGroupRefLabel(ref) || ref,
    });
  };

  const mapStopCount = mapTours.reduce((n, t) => n + (t.stops?.length ?? 0), 0);
  const timelineEventCount = timelineTours.reduce((n, t) => n + (t.events?.length ?? 0), 0);

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className="icon-btn"
          aria-label="返回"
          onClick={() => {
            if (backHref.startsWith('/')) router.push(backHref);
            else router.back();
          }}
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: 'var(--app-heading-size, 18px)' }}>搜索</h2>
      </header>

      <input
        className="search-input"
        autoFocus
        placeholder="搜索经文、笔记…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(query);
        }}
      />

      {history.length > 0 && (
        <div className="chip-row" style={{ marginTop: 12 }}>
          {history.map((h) => (
            <button
              key={h}
              type="button"
              className="book-chip"
              style={{ width: 'auto' }}
              onClick={() => applyHistoryQuery(h)}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {!hasQuery && (
        <section className="story-card-rail" style={{ marginTop: 14 }}>
          <div className="story-card-grid story-card-grid-pair">
            {mapTours.length > 0 && (
              <div className={`card card-2 story-tour-card${mapOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="story-tour-head"
                  onClick={() => {
                    setMapOpen((v) => !v);
                    setTimelineOpen(false);
                  }}
                >
                  <span className="story-tour-badge">地图故事</span>
                  <strong className="story-tour-title">圣经背景专题</strong>
                  <p className="muted story-tour-meta">
                    {mapTours.map((t) => t.title).join(' · ')}
                    {mapStopCount > 0 ? ` · ${mapStopCount} 站` : ''}
                  </p>
                  <span className="story-tour-toggle">{mapOpen ? '收起' : '查看详情 ›'}</span>
                </button>
                {mapOpen && (
                  <div className="story-tour-body">
                    {mapTours.map((tour) => (
                      <div key={tour.id} className="story-tour-block">
                        <strong className="story-tour-block-title">{tour.title}</strong>
                        {tour.era || tour.subtitle ? (
                          <p className="muted story-tour-meta">
                            {[tour.era, tour.subtitle].filter(Boolean).join(' · ')}
                          </p>
                        ) : null}
                        {tour.description ? (
                          <p className="story-tour-lead">{tour.description}</p>
                        ) : null}
                        <ol className="story-step-list">
                          {(tour.stops ?? []).map((stop, idx) => (
                            <li key={stop.order} className="story-step">
                              <span className="story-step-num" aria-hidden>{idx + 1}</span>
                              <div className="story-step-main">
                                <strong className="story-step-title">{stop.label}</strong>
                                {stop.note ? (
                                  <p className="muted story-step-note">{stop.note}</p>
                                ) : null}
                                {stop.ref ? (
                                  <button
                                    type="button"
                                    className="story-step-cta"
                                    onClick={() => {
                                      const href = readerHrefFromRef(stop.ref);
                                      if (href) window.location.href = href;
                                      else openRef(stop.ref);
                                    }}
                                  >
                                    读这段 · {formatGroupRefLabel(stop.ref) || stop.ref}
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {timelineTours.length > 0 && (
              <div className={`card card-2 story-tour-card${timelineOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="story-tour-head"
                  onClick={() => {
                    setTimelineOpen((v) => !v);
                    setMapOpen(false);
                  }}
                >
                  <span className="story-tour-badge story-tour-badge-time">时间故事</span>
                  <strong className="story-tour-title">时间线专题</strong>
                  <p className="muted story-tour-meta">
                    {timelineTours.map((t) => t.title).join(' · ')}
                    {timelineEventCount > 0 ? ` · ${timelineEventCount} 个节点` : ''}
                  </p>
                  <span className="story-tour-toggle">{timelineOpen ? '收起' : '查看详情 ›'}</span>
                </button>
                {timelineOpen && (
                  <div className="story-tour-body">
                    {timelineTours.map((tour) => (
                      <div key={tour.id} className="story-tour-block">
                        <strong className="story-tour-block-title">{tour.title}</strong>
                        {tour.subtitle ? (
                          <p className="muted story-tour-meta">{tour.subtitle}</p>
                        ) : null}
                        {tour.description ? (
                          <p className="story-tour-lead">{tour.description}</p>
                        ) : null}
                        <ol className="story-step-list">
                          {(tour.events ?? []).map((ev, idx) => {
                            const ref = `${ev.book} ${ev.chapter}:1`;
                            return (
                              <li key={ev.order} className="story-step">
                                <span className="story-step-num" aria-hidden>{idx + 1}</span>
                                <div className="story-step-main">
                                  <strong className="story-step-title">
                                    {ev.label}
                                    {ev.year_display ? (
                                      <span className="muted story-step-year"> · {ev.year_display}</span>
                                    ) : null}
                                  </strong>
                                  {ev.note ? (
                                    <p className="muted story-step-note">{ev.note}</p>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="story-step-cta"
                                    onClick={() => {
                                      const href = readerHrefFromRef(ref);
                                      if (href) window.location.href = href;
                                      else openRef(ref);
                                    }}
                                  >
                                    读这段 · {formatGroupRefLabel(ref) || `${ev.book} ${ev.chapter}`}
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {!toursReady && (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>加载专题…</p>
          )}
        </section>
      )}

      {hasQuery && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">经文</h3>
          {loading && <p className="muted">搜索中…</p>}
          {err && <p className="muted">搜索失败：{err}</p>}
          {!loading && !err && hits.length === 0 && (
            <p className="muted">未找到匹配经文</p>
          )}
          {hits.map((h) => (
            <div
              key={h.osis}
              className="card card-2"
              style={{ marginBottom: 8, padding: 14, cursor: 'pointer' }}
              onClick={() => openReader(h)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--accent-deep)' }}>
                  {formatGroupRefLabel(h.ref)}
                </span>
                {h.version && h.version !== 'cnv' && (
                  <span className="version-badge">{h.version.toUpperCase()}</span>
                )}
              </div>
              <p style={{ margin: '6px 0 8px', lineHeight: 1.55, color: 'var(--ink-soft)' }}>
                {h.text}
              </p>
              <button
                type="button"
                className="text-link"
                onClick={(e) => {
                  e.stopPropagation();
                  openAssistant(h);
                }}
              >
                问小爱
              </button>
            </div>
          ))}
        </section>
      )}

      {hasQuery && noteHits.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">笔记 · {noteHits.length}</h3>
          {noteHits.map((n) => (
            <div
              key={n.id}
              className="card card-2"
              style={{ marginBottom: 8, padding: 14 }}
            >
              {n.ref && (
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--gold, #b8860b)' }}>
                  {formatGroupRefLabel(n.ref)}
                </span>
              )}
              <p style={{ margin: n.ref ? '6px 0 0' : 0, lineHeight: 1.55 }}>
                {n.body}
              </p>
            </div>
          ))}
        </section>
      )}

      {query.trim().length === 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">热门关键词</h3>
          <div className="theme-grid hot-keyword-grid">
            {LIFE_TOPICS.slice(0, 8).map((t) => (
              <button
                key={t.id}
                type="button"
                className="theme-chip hot-keyword-chip"
                onClick={() => applyHistoryQuery(t.title)}
              >
                {t.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {preview && (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      )}
    </main>
  );
}
