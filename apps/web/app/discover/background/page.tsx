'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  api,
  type GeoPlace,
  type MapTour,
  type TimelineChapter,
  type TimelineTour,
} from '@/lib/api';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';

export default function BibleBackgroundPage() {
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [timeline, setTimeline] = useState<TimelineChapter[]>([]);
  const [mapTours, setMapTours] = useState<MapTour[]>([]);
  const [timelineTours, setTimelineTours] = useState<TimelineTour[]>([]);
  const [expandedMap, setExpandedMap] = useState<string | null>(null);
  const [expandedTimeline, setExpandedTimeline] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api.geography().then((d) => setPlaces((d.places ?? []).slice(0, 40))),
      api.timeline().then((d) => setTimeline((d.chapters ?? []).slice(0, 30))),
      api.mapTours().then((d) => setMapTours(d.tours ?? [])),
      api.timelineTours().then((d) => setTimelineTours(d.tours ?? [])),
    ]).finally(() => setLoading(false));
  }, []);

  const openRef = (ref: string) => {
    setPreview({
      osis: refSpaceToOsis(ref.replace(/\./g, ' ')),
      label: formatGroupRefLabel(ref) || ref,
    });
  };

  return (
    <main className="container discover-page">
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/discover" className="muted">‹ 发现</Link>
        <strong>地理 · 时间线</strong>
        <span />
      </div>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 8 }}>
        圣经背景资料：地图专题、历史分期与主要地点，可在阅读时对照理解叙事时空。
      </p>

      <div className="section-row" style={{ marginTop: 16 }}>
        <span>地图专题</span>
      </div>
      {loading ? (
        <p className="muted">加载中…</p>
      ) : mapTours.length === 0 ? (
        <p className="muted">暂无地图专题</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {mapTours.map((tour) => {
            const open = expandedMap === tour.id;
            return (
              <div key={tour.id} className="card card-2" style={{ padding: 12 }}>
                <button
                  type="button"
                  className="text-link"
                  style={{ textAlign: 'left', width: '100%' }}
                  onClick={() => setExpandedMap(open ? null : tour.id)}
                >
                  <strong>{tour.title}</strong>
                  {tour.era ? (
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{tour.era}</span>
                  ) : null}
                  {tour.subtitle ? (
                    <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{tour.subtitle}</p>
                  ) : null}
                </button>
                {open && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {tour.description ? (
                      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{tour.description}</p>
                    ) : null}
                    {(tour.stops ?? []).map((stop) => (
                      <div key={stop.order} className="card card-2" style={{ padding: 10 }}>
                        <strong>{stop.order}. {stop.label}</strong>
                        {stop.note ? (
                          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{stop.note}</p>
                        ) : null}
                        {stop.place ? (
                          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                            {stop.place.latitude.toFixed(2)}°, {stop.place.longitude.toFixed(2)}°
                          </p>
                        ) : null}
                        <div className="share-actions" style={{ marginTop: 6 }}>
                          {stop.ref ? (
                            <>
                              <button type="button" className="font-pill" onClick={() => openRef(stop.ref)}>
                                {formatGroupRefLabel(stop.ref) || stop.ref}
                              </button>
                              <Link className="font-pill" href={readerHrefFromRef(stop.ref) || '/reader'}>
                                阅读
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="section-row" style={{ marginTop: 18 }}>
        <span>时间线专题</span>
      </div>
      {!loading && timelineTours.length === 0 ? (
        <p className="muted">暂无时间线专题</p>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {timelineTours.map((tour) => {
            const open = expandedTimeline === tour.id;
            return (
              <div key={tour.id} className="card card-2" style={{ padding: 12 }}>
                <button
                  type="button"
                  className="text-link"
                  style={{ textAlign: 'left', width: '100%' }}
                  onClick={() => setExpandedTimeline(open ? null : tour.id)}
                >
                  <strong>{tour.title}</strong>
                  {tour.subtitle ? (
                    <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{tour.subtitle}</p>
                  ) : null}
                </button>
                {open && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tour.description ? (
                      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{tour.description}</p>
                    ) : null}
                    {(tour.events ?? []).map((ev) => (
                      <div key={ev.order} className="card card-2" style={{ padding: 10 }}>
                        <strong>{ev.label}</strong>
                        {ev.year_display ? (
                          <span className="muted" style={{ marginLeft: 8 }}>{ev.year_display}</span>
                        ) : null}
                        {ev.note ? (
                          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{ev.note}</p>
                        ) : null}
                        <div className="share-actions" style={{ marginTop: 6 }}>
                          <button
                            type="button"
                            className="font-pill"
                            onClick={() => openRef(`${ev.book} ${ev.chapter}:1`)}
                          >
                            {ev.book} {ev.chapter}
                          </button>
                          <Link
                            className="font-pill"
                            href={readerHrefFromRef(`${ev.book} ${ev.chapter}:1`) || '/reader'}
                          >
                            阅读
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="section-row" style={{ marginTop: 18 }}>
        <span>主要地点</span>
      </div>
      {loading ? (
        <p className="muted">加载中…</p>
      ) : places.length === 0 ? (
        <p className="muted">暂无地理数据</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {places.map((p) => (
            <div key={p.id || p.name} className="card card-2" style={{ padding: 12 }}>
              <strong>{p.name}</strong>
              {p.type ? (
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{p.type}</span>
              ) : null}
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                {p.latitude.toFixed(2)}°, {p.longitude.toFixed(2)}°
              </p>
              {p.refs?.length ? (
                <div className="share-actions" style={{ marginTop: 8 }}>
                  {p.refs.slice(0, 4).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="font-pill"
                      onClick={() => openRef(r)}
                    >
                      {formatGroupRefLabel(r) || r}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="section-row" style={{ marginTop: 18 }}>
        <span>历史时间线（节选）</span>
      </div>
      {!loading && timeline.length === 0 ? (
        <p className="muted">暂无时间线数据</p>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {timeline.map((row, i) => (
            <div key={i} className="card card-2" style={{ padding: 10 }}>
              <strong>{row.book} {row.chapter}</strong>
              {row.year_display ? (
                <span className="muted" style={{ marginLeft: 8 }}>{row.year_display}</span>
              ) : null}
              {row.note ? (
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{row.note}</p>
              ) : null}
            </div>
          ))}
        </div>
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
