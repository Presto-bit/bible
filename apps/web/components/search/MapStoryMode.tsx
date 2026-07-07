'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type GeoPlace, type MapTour } from '@/lib/api';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { recordMapTour } from '@/lib/badge_events';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { GeoMiniMap } from '@/components/knowledge/GeoMiniMap';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';

export function MapStoryMode({
  tourId,
  backHref = '/search',
  backLabel = '搜索',
}: {
  tourId: string;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const goBack = useFlowBack(backHref);
  const [tour, setTour] = useState<MapTour | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    setStep(0);
    void api
      .mapTour(tourId)
      .then((d) => {
        setTour(d.tour);
        recordMapTour(tourId);
      })
      .catch(() => setTour(null))
      .finally(() => setLoading(false));
  }, [tourId]);

  const stops = tour?.stops ?? [];
  const current = stops[step] ?? null;
  const mapPlaces = useMemo(() => {
    return stops
      .map((s) => s.place)
      .filter((p): p is GeoPlace => Boolean(p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)));
  }, [stops]);
  const routeStops = useMemo(
    () => stops.map((s) => ({ placeId: s.place_id, order: s.order, label: s.label })),
    [stops],
  );

  const openRef = (ref: string) => {
    const href = readerHrefFromRef(ref);
    if (href) window.location.href = href;
    else {
      setPreview({
        osis: refSpaceToOsis(ref.replace(/\./g, ' ')),
        label: formatGroupRefLabel(ref) || ref,
      });
    }
  };

  if (loading) {
    return <p className="muted">加载路线…</p>;
  }
  if (!tour || !current) {
    return <p className="muted">未找到该路线</p>;
  }

  const isLast = step >= stops.length - 1;

  return (
    <>
      <header className="page-head story-mode-head">
        <PageBackBar onClick={goBack} label={backLabel} />
        <h2 className="page-head-title">{tour.title}</h2>
      </header>
      <p className="muted story-mode-sub">
        {[tour.era, tour.subtitle].filter(Boolean).join(' · ')}
      </p>
      <div className="story-mode-progress" aria-live="polite">
        第 <strong>{step + 1}</strong> / {stops.length} 站
        {current.label ? ` · ${current.label}` : ''}
      </div>

      {mapPlaces.length > 0 ? (
        <div className="story-mode-map">
          <GeoMiniMap
            places={mapPlaces}
            activeId={current.place_id}
            height={220}
            routeStops={routeStops}
            onPlaceClick={(place) => {
              const idx = stops.findIndex((s) => s.place_id === place.id);
              if (idx >= 0) setStep(idx);
            }}
          />
        </div>
      ) : null}

      <div className="card card-2 story-mode-card">
        <strong className="story-mode-stop-title">{current.label}</strong>
        {current.note ? (
          <p className="muted story-mode-stop-note">{current.note}</p>
        ) : null}
        {tour.description && step === 0 ? (
          <p className="story-mode-lead">{tour.description}</p>
        ) : null}
        {tour.confidence === 'traditional' ? (
          <p className="map-confidence-hint">传统示意路线 · 坐标为近似位置</p>
        ) : null}
      </div>

      <div className="story-mode-actions">
        {current.ref ? (
          <button type="button" className="font-pill accent" onClick={() => openRef(current.ref)}>
            读本节 · {formatGroupRefLabel(current.ref) || current.ref}
          </button>
        ) : null}
        {!isLast ? (
          <button type="button" className="font-pill" onClick={() => setStep((s) => s + 1)}>
            下一站 · {stops[step + 1]?.label} ›
          </button>
        ) : (
          <button type="button" className="font-pill" onClick={() => setStep(0)}>
            回到起点
          </button>
        )}
        {step > 0 ? (
          <button type="button" className="text-link story-mode-back-step" onClick={() => setStep((s) => s - 1)}>
            ‹ 上一站
          </button>
        ) : null}
      </div>

      <div className="story-mode-footer-links">
        <button
          type="button"
          className="text-link"
          onClick={() => router.push(`/dictionary/${encodeURIComponent(current.place_id)}`)}
        >
          查看「{current.label}」词条
        </button>
        <Link href="/search/map" className="text-link">切换路线</Link>
      </div>

      {preview ? (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}
