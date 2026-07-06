'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type GeoPlace, type MapTour, type TimelineTour } from '@/lib/api';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { recordMapTour, recordTimelineTour } from '@/lib/badge_events';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { GeoMiniMap } from '@/components/knowledge/GeoMiniMap';

export function MapTourPanels({
  tours,
  initialOpenId,
}: {
  tours: MapTour[];
  initialOpenId?: string | null;
}) {
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? tours[0]?.id ?? null);
  const [detail, setDetail] = useState<MapTour | null>(null);
  const [activeStop, setActiveStop] = useState<string | null>(null);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    void api.mapTour(openId).then((d) => setDetail(d.tour)).catch(() => setDetail(null));
  }, [openId]);

  const mapPlaces = useMemo(() => {
    const stops = detail?.stops ?? [];
    return stops
      .map((s) => s.place)
      .filter((p): p is GeoPlace => Boolean(p && p.latitude && p.longitude));
  }, [detail]);

  if (!tours.length) {
    return <p className="muted">暂无地图专题</p>;
  }

  return (
    <>
      <div className="story-detail-list">
        {tours.map((tour) => {
          const open = openId === tour.id;
          return (
            <div key={tour.id} className={`card card-2 story-tour-card${open ? ' is-open' : ''}`}>
              <button
                type="button"
                className="story-tour-head"
                onClick={() => {
                  if (!open) recordMapTour(tour.id);
                  setOpenId(open ? null : tour.id);
                  setActiveStop(null);
                }}
              >
                <span className="story-tour-badge">地图故事</span>
                <strong className="story-tour-title">{tour.title}</strong>
                <p className="muted story-tour-meta">
                  {[tour.era, tour.subtitle, `${tour.stops?.length ?? 0} 站`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <span className="story-tour-toggle">{open ? '收起' : '展开 ›'}</span>
              </button>
              {open && (
                <div className="story-tour-body">
                  {tour.description ? (
                    <p className="story-tour-lead">{tour.description}</p>
                  ) : null}
                  {mapPlaces.length > 0 ? (
                    <div style={{ marginBottom: 12 }}>
                      <GeoMiniMap
                        places={mapPlaces}
                        activeId={activeStop}
                        height={180}
                      />
                    </div>
                  ) : null}
                  <ol className="story-step-list">
                    {(detail?.stops ?? tour.stops ?? []).map((stop, idx) => (
                      <li
                        key={stop.order}
                        className={`story-step${activeStop === stop.place_id ? ' is-active' : ''}`}
                      >
                        <span className="story-step-num" aria-hidden>{idx + 1}</span>
                        <div className="story-step-main">
                          <button
                            type="button"
                            className="story-step-title story-step-title-btn"
                            onClick={() => setActiveStop(stop.place_id)}
                          >
                            {stop.label}
                          </button>
                          <Link
                            href={`/dictionary/${encodeURIComponent(stop.place_id || stop.label)}`}
                            className="story-step-cta"
                            style={{ marginTop: 4, display: 'inline-block' }}
                          >
                            查看词条 ›
                          </Link>
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
                                else {
                                  setPreview({
                                    osis: refSpaceToOsis(stop.ref.replace(/\./g, ' ')),
                                    label: formatGroupRefLabel(stop.ref) || stop.ref,
                                  });
                                }
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
              )}
            </div>
          );
        })}
      </div>
      {preview && (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

export function TimelineTourPanels({ tours }: { tours: TimelineTour[] }) {
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(tours[0]?.id ?? null);

  if (!tours.length) {
    return <p className="muted">暂无时间线专题</p>;
  }

  return (
    <>
      <div className="story-detail-list">
        {tours.map((tour) => {
          const open = openId === tour.id;
          return (
            <div key={tour.id} className={`card card-2 story-tour-card${open ? ' is-open' : ''}`}>
              <button
                type="button"
                className="story-tour-head"
                onClick={() => {
                  if (!open) recordTimelineTour(tour.id);
                  setOpenId(open ? null : tour.id);
                }}
              >
                <span className="story-tour-badge story-tour-badge-time">时间故事</span>
                <strong className="story-tour-title">{tour.title}</strong>
                <p className="muted story-tour-meta">
                  {[tour.subtitle, `${tour.events?.length ?? 0} 个节点`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <span className="story-tour-toggle">{open ? '收起' : '展开 ›'}</span>
              </button>
              {open && (
                <div className="story-tour-body">
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
                                else {
                                  setPreview({
                                    osis: refSpaceToOsis(ref.replace(/\./g, ' ')),
                                    label: formatGroupRefLabel(ref) || ref,
                                  });
                                }
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
              )}
            </div>
          );
        })}
      </div>
      {preview && (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
