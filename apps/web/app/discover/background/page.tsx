'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type GeoPlace, type TimelineChapter } from '@/lib/api';
import { AssistantLink } from '@/components/AssistantLink';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { formatGroupRefLabel } from '@/lib/ref_label';

export default function BibleBackgroundPage() {
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [timeline, setTimeline] = useState<TimelineChapter[]>([]);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api.geography().then((d) => setPlaces((d.places ?? []).slice(0, 40))),
      api.timeline().then((d) => setTimeline((d.chapters ?? []).slice(0, 30))),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <main className="container discover-page">
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/discover" className="muted">‹ 发现</Link>
        <strong>地理 · 时间线</strong>
        <span />
      </div>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 8 }}>
        圣经背景资料：主要地点坐标与书卷章节的历史分期，可在阅读时对照理解叙事时空。
      </p>

      <div className="section-row" style={{ marginTop: 16 }}>
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
                      onClick={() => setPreview({
                        osis: refSpaceToOsis(r.replace(/\./g, ' ')),
                        label: formatGroupRefLabel(r) || r,
                      })}
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
