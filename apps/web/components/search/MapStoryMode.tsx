'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  api,
  type GeoPlace,
  type KnowledgeLayout,
  type KnowledgeLayoutBeat,
  type MapTour,
} from '@/lib/api';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { recordMapTour } from '@/lib/badge_events';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { GeoMiniMap } from '@/components/knowledge/GeoMiniMap';
import { SchematicPathMap } from '@/components/knowledge/SchematicPathMap';
import { KnowledgeBeatGrid } from '@/components/knowledge/KnowledgeBeatGrid';
import { KnowledgeArcStrip } from '@/components/knowledge/KnowledgeArcStrip';
import { KnowledgeStepStrip } from '@/components/knowledge/KnowledgeStepStrip';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { KnowledgeStoryEnd } from '@/components/search/KnowledgeStoryEnd';
import { KnowledgeAskSheet } from '@/components/search/KnowledgeAskSheet';
import {
  estimateTourMinutes,
  knowledgeAskQuestion,
  nextInExodusSeries,
  tourHook,
} from '@/lib/knowledge_story';
import {
  resumeKnowledgeStep,
  saveKnowledgeProgress,
} from '@/lib/knowledge_progress';
import { isSchematicTour, SCHEMATIC_PATHS } from '@/lib/schematic_paths';

function shortHappen(text?: string) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > 18 ? `${t.slice(0, 18)}…` : t;
}

function beatForStop(
  layout: KnowledgeLayout | null,
  order: number,
  placeId: string,
): KnowledgeLayoutBeat | null {
  if (!layout?.beats?.length) return null;
  return (
    layout.beats.find((b) => b.order === order) ||
    layout.beats.find((b) => b.place_id === placeId) ||
    null
  );
}

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
  const [layout, setLayout] = useState<KnowledgeLayout | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);
  const [showQuote, setShowQuote] = useState(false);

  useEffect(() => {
    setLoading(true);
    setStep(0);
    setResumedFrom(null);
    setAskOpen(false);
    setShowQuote(false);
    setLayout(null);
    void Promise.all([
      api.mapTour(tourId),
      api.knowledgeLayout(tourId).catch(() => null),
    ])
      .then(([tourRes, layoutRes]) => {
        setTour(tourRes.tour);
        setLayout(layoutRes?.layout ?? null);
        recordMapTour(tourId);
        const total = tourRes.tour?.stops?.length ?? 0;
        const resume = resumeKnowledgeStep('map', tourId);
        if (resume != null && resume > 0 && resume < total) {
          setStep(resume);
          setResumedFrom(resume);
        }
      })
      .catch(() => {
        setTour(null);
        setLayout(null);
      })
      .finally(() => setLoading(false));
  }, [tourId]);

  const stops = tour?.stops ?? [];
  const current = stops[step] ?? null;
  const schematic = isSchematicTour(tourId) ? SCHEMATIC_PATHS[tourId] : null;
  /** 有 layout = 走「结构→版式→多区块同屏」 */
  const multiBlock = Boolean(layout?.beats?.length);
  const showBeatGrid = multiBlock || Boolean(schematic);

  const mapPlaces = useMemo(() => {
    return stops
      .map((s) => s.place)
      .filter((p): p is GeoPlace => Boolean(p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)));
  }, [stops]);
  const routeStops = useMemo(
    () => stops.map((s) => ({ placeId: s.place_id, order: s.order, label: s.label })),
    [stops],
  );
  const beatItems = useMemo(
    () =>
      stops.map((s) => {
        const beat = beatForStop(layout, s.order, s.place_id);
        const happenPreferred =
          beat?.happen || schematic?.happenByPlaceId?.[s.place_id];
        return {
          order: s.order,
          placeId: s.place_id,
          label: beat?.label || s.label,
          happen: shortHappen(happenPreferred || s.note),
          thumb: beat?.vignette || schematic?.vignettes?.[s.place_id],
        };
      }),
    [stops, schematic, layout],
  );
  const stepItems = useMemo(
    () =>
      stops.map((s) => {
        const beat = beatForStop(layout, s.order, s.place_id);
        return {
          order: s.order,
          label: beat?.label || s.label,
          happen: shortHappen(beat?.happen || schematic?.happenByPlaceId?.[s.place_id] || s.note),
        };
      }),
    [stops, layout, schematic],
  );

  const goToOrder = (order: number) => {
    const idx = stops.findIndex((s) => s.order === order);
    if (idx >= 0) setStep(idx);
  };

  useEffect(() => {
    if (!tour || stops.length === 0) return;
    const isLast = step >= stops.length - 1;
    saveKnowledgeProgress('map', tourId, {
      step,
      total: stops.length,
      completed: isLast,
    });
  }, [tour, tourId, step, stops.length]);

  useEffect(() => {
    setShowQuote(false);
  }, [step]);

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

  const askHere = () => setAskOpen(true);

  if (loading) {
    return <p className="muted">正在载入路线…</p>;
  }
  if (!tour || !current) {
    return (
      <p className="muted">
        未找到该路线。
        <a href="/search/map"> 返回列表 ›</a>
      </p>
    );
  }

  const isLast = step >= stops.length - 1;
  const hook = tourHook(tour.id);
  const mins = estimateTourMinutes(stops.length);
  const currentBeat = beatForStop(layout, current.order, current.place_id);
  const askQ = knowledgeAskQuestion({
    title: tour.title,
    stopLabel: current.label,
    askSeed: currentBeat?.ask_seed || current.ask_seed,
    ref: currentBeat?.ref || current.ref,
  });
  const happen = shortHappen(
    currentBeat?.happen ||
      schematic?.happenByPlaceId?.[current.place_id] ||
      current.note,
  );
  const chips =
    (currentBeat?.chips?.length ? currentBeat.chips : null) ||
    schematic?.chipsByPlaceId?.[current.place_id] ||
    [];
  const vignette =
    currentBeat?.vignette || schematic?.vignettes?.[current.place_id];
  const guideLine = layout?.guide_one_liner;
  const linkLine = currentBeat?.link;

  return (
    <div className={multiBlock ? 'knowledge-blocks' : undefined}>
      <header className="page-head story-mode-head">
        <PageBackBar onClick={goBack} label={backLabel} />
        <h2 className="page-head-title">{tour.title}</h2>
      </header>
      <p className="muted story-mode-sub">
        {[tour.era, tour.subtitle].filter(Boolean).join(' · ')}
        {` · 约 ${mins} 分钟`}
        {multiBlock ? ' · 多区块讲解' : ''}
      </p>
      {(guideLine || (step === 0 && hook)) ? (
        <p className="story-mode-hook">{guideLine || hook}</p>
      ) : null}
      {resumedFrom != null && step === resumedFrom ? (
        <p className="muted story-mode-resume">已从第 {resumedFrom + 1} 站继续</p>
      ) : null}

      {multiBlock && layout?.arc?.length ? (
        <section className="knowledge-block">
          <p className="story-mode-section-label"><strong>① 叙事弧</strong><span>结构</span></p>
          <KnowledgeArcStrip
            arcs={layout.arc}
            activeOrder={current.order}
            onSelectOrder={goToOrder}
          />
        </section>
      ) : null}

      <section className="knowledge-block">
          {multiBlock ? (
            <p className="story-mode-section-label"><strong>② 路径总览</strong><span>diagram</span></p>
          ) : (
            <div className="story-mode-progress" aria-live="polite">
              第 <strong>{step + 1}</strong> / {stops.length} 站
              {current.label ? ` · ${current.label}` : ''}
            </div>
          )}
          {schematic ? (
            <div className="story-mode-map">
              <SchematicPathMap
                layoutId={schematic.id}
                stops={routeStops.map((s) => ({
                  placeId: s.placeId,
                  order: s.order,
                  label: s.label || '',
                }))}
                activePlaceId={current.place_id}
                activeOrder={current.order}
                height={multiBlock ? 190 : 210}
                onStopClick={(_placeId, order) => goToOrder(order)}
              />
            </div>
          ) : mapPlaces.length > 0 ? (
            <div className="story-mode-map">
              <GeoMiniMap
                places={mapPlaces}
                activeId={current.place_id}
                height={multiBlock ? 190 : 220}
                routeStops={routeStops}
                onPlaceClick={(place) => {
                  const idx = stops.findIndex((s) => s.place_id === place.id);
                  if (idx >= 0) setStep(idx);
                }}
              />
            </div>
          ) : !multiBlock ? null : (
            <p className="muted" style={{ margin: '0 0 8px' }}>第 {step + 1} / {stops.length} 站 · {current.label}</p>
          )}
        </section>

      {multiBlock && stepItems.length > 0 ? (
        <section className="knowledge-block">
          <p className="story-mode-section-label"><strong>③ 站序事实</strong><span>每站一句</span></p>
          <KnowledgeStepStrip
            steps={stepItems}
            activeOrder={current.order}
            onSelect={goToOrder}
          />
        </section>
      ) : null}

      {showBeatGrid && beatItems.length > 0 ? (
        <section className="knowledge-block story-mode-beats">
          <p className="story-mode-section-label">
            <strong>{multiBlock ? '④ 多格叙事' : '多格导航'}</strong>
            {multiBlock ? <span>一格一事</span> : null}
          </p>
          <KnowledgeBeatGrid
            items={beatItems}
            activeOrder={current.order}
            onSelect={goToOrder}
          />
        </section>
      ) : null}

      <section className="knowledge-block">
          {multiBlock ? (
            <p className="story-mode-section-label"><strong>⑤ 当前站</strong><span>干净图 + 讲解条</span></p>
          ) : null}
          <div className="knowledge-explain-card">
            {vignette ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="knowledge-explain-art" src={vignette} alt="" />
            ) : null}
            <div className="knowledge-explain-body">
              <strong className="story-mode-stop-title">{current.label}</strong>
              {current.ref ? (
                <p className="knowledge-explain-ref">
                  {formatGroupRefLabel(current.ref) || current.ref}
                </p>
              ) : null}
              {happen ? <p className="knowledge-explain-happen">{happen}</p> : null}
              {linkLine ? <p className="knowledge-explain-link">{linkLine}</p> : null}
              {chips.length > 0 ? (
                <div className="knowledge-explain-chips">
                  {chips.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              ) : null}
              {current.note && current.note.trim() !== happen.replace(/…$/, '') && current.note.length > happen.length ? (
                showQuote ? (
                  <p className="story-mode-stop-note">{current.note}</p>
                ) : (
                  <button
                    type="button"
                    className="text-link knowledge-explain-more"
                    onClick={() => setShowQuote(true)}
                  >
                    展开说明 ›
                  </button>
                )
              ) : null}
              {tour.description && step === 0 && !guideLine ? (
                <p className="muted story-mode-lead">{tour.description}</p>
              ) : null}
              {tour.confidence === 'traditional' ? (
                <p className="map-confidence-hint">传统示意路线 · 坐标为近似位置</p>
              ) : null}
            </div>
          </div>
        </section>

      <div className="story-mode-actions">
        {current.ref ? (
          <button type="button" className="font-pill accent" onClick={() => openRef(current.ref)}>
            读本节 · {formatGroupRefLabel(current.ref) || current.ref}
          </button>
        ) : null}
        <button type="button" className="font-pill" onClick={askHere}>
          问小爱
        </button>
        {!isLast ? (
          <button type="button" className="font-pill" onClick={() => setStep((s) => s + 1)}>
            下一站 · {stops[step + 1]?.label} ›
          </button>
        ) : null}
        {step > 0 ? (
          <button type="button" className="text-link story-mode-back-step" onClick={() => setStep((s) => s - 1)}>
            ‹ 上一站
          </button>
        ) : null}
      </div>

      {isLast ? (
        <KnowledgeStoryEnd
          title={tour.title}
          related={tour.related}
          seriesNext={nextInExodusSeries('map', tourId)}
          listHref="/search/map"
          listLabel="切换其他路线 ›"
          onAsk={askHere}
          onRestart={() => {
            setResumedFrom(null);
            setStep(0);
            saveKnowledgeProgress('map', tourId, { step: 0, total: stops.length, completed: false });
          }}
          restartLabel="回到起点"
          share={{
            kind: 'map',
            id: tour.id,
            highlight: current.note || hook || tour.subtitle,
            stopCount: stops.length,
            unit: '站',
            infographic: layout
              ? {
                  guide: layout.guide_one_liner || guideLine || undefined,
                  vignetteUrl:
                    currentBeat?.vignette ||
                    layout.beats.find((b) => b.vignette)?.vignette ||
                    null,
                  arcNames: (layout.arc || []).map((a) => a.name),
                  beats: layout.beats.map((b) => ({
                    order: b.order,
                    label: b.label,
                    happen: b.happen,
                    link: b.link,
                    ref: b.ref,
                  })),
                }
              : null,
          }}
        />
      ) : (
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
      )}

      {askOpen ? (
        <KnowledgeAskSheet
          title={tour.title}
          question={askQ}
          refParam={current.ref}
          onClose={() => setAskOpen(false)}
        />
      ) : null}

      {preview ? (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
