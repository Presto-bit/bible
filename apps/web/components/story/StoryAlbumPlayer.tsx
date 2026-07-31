'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, type BibleDiagram, type GeoPlace, type MapTour } from '@/lib/api';
import {
  EXODUS_STORY,
  exodusCoverHref,
  exodusPlayHref,
  findBeatIndexByHotspot,
  findBeatIndexByPlace,
  type StoryBeat,
  type StoryEpisode,
} from '@/lib/exodus_series';
import {
  markEpisodeDone,
  markSeriesDone,
  saveStoryAlbumProgress,
} from '@/lib/story_album_progress';
import { knowledgeAskQuestion } from '@/lib/knowledge_story';
import { shareKnowledgeTour } from '@/lib/knowledge_share';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { GeoMiniMap } from '@/components/knowledge/GeoMiniMap';
import { KnowledgeAskSheet } from '@/components/search/KnowledgeAskSheet';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { SheetCloseButton } from '@/components/PageBackBar';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

const SWIPE_MIN = 48;

type PlacePreview = {
  placeId: string;
  title: string;
  narration: string;
  beatIndex: number;
};

export function StoryAlbumPlayer({
  episodeIndex: initialEp,
  beatIndex: initialBeat,
}: {
  episodeIndex: number;
  beatIndex: number;
}) {
  const series = EXODUS_STORY;
  const [epIndex, setEpIndex] = useState(initialEp);
  const [beatIndex, setBeatIndex] = useState(initialBeat);
  const [tour, setTour] = useState<MapTour | null>(null);
  const [diagram, setDiagram] = useState<BibleDiagram | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [placePreview, setPlacePreview] = useState<PlacePreview | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [insightOpen, setInsightOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number; inCaption: boolean } | null>(null);
  const ignoreSwipe = useRef(false);
  const [pullDy, setPullDy] = useState(0);

  const episode: StoryEpisode | null = series.episodes[epIndex] ?? null;
  const beats = episode?.beats ?? [];
  const beat: StoryBeat | null = beats[beatIndex] ?? null;
  const isLastBeat = beatIndex >= beats.length - 1;

  useEffect(() => {
    setEpIndex(initialEp);
    setBeatIndex(initialBeat);
  }, [initialEp, initialBeat]);

  useEffect(() => {
    if (!episode) return;
    const src = episode.source;
    if (src?.kind === 'map') {
      void api.mapTour(src.id).then((d) => setTour(d.tour)).catch(() => setTour(null));
    } else {
      setTour(null);
    }
    if (src?.kind === 'diagram' || beats.some((b) => b.media === 'diagram')) {
      const id = src?.kind === 'diagram' ? src.id : 'tabernacle-layout';
      void api.diagram(id).then((d) => setDiagram(d.diagram)).catch(() => setDiagram(null));
    } else {
      setDiagram(null);
    }
  }, [episode, beats]);

  useEffect(() => {
    setInsightOpen(false);
  }, [epIndex, beatIndex]);

  useEffect(() => {
    if (!episode || !beat) return;
    saveStoryAlbumProgress(series.id, {
      episodeIndex: epIndex,
      beatIndex,
    });
    if (beat.media === 'fin') {
      markEpisodeDone(series.id, episode.id, true);
      if (beat.fin_kind === 'series') markSeriesDone(series.id, true);
    }
    const url = exodusPlayHref(epIndex, beatIndex);
    window.history.replaceState(null, '', url);
  }, [series.id, episode, epIndex, beatIndex, beat]);

  const mapPlaces = useMemo(() => {
    const stops = tour?.stops ?? [];
    return stops
      .map((s) => s.place)
      .filter((p): p is GeoPlace => Boolean(p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)));
  }, [tour]);

  const routeStops = useMemo(
    () => (tour?.stops ?? []).map((s) => ({ placeId: s.place_id, order: s.order, label: s.label })),
    [tour],
  );

  const goBeat = useCallback((next: number) => {
    if (!episode) return;
    const clamped = Math.max(0, Math.min(beats.length - 1, next));
    setBeatIndex(clamped);
    setPlacePreview(null);
    setAskOpen(false);
  }, [episode, beats.length]);

  const goNext = useCallback(() => {
    if (!episode || !beat) return;
    if (beat.media === 'fin') {
      if (beat.fin_kind === 'series') {
        markSeriesDone(series.id, true);
        markEpisodeDone(series.id, episode.id, true);
        return;
      }
      markEpisodeDone(series.id, episode.id, true);
      if (epIndex < series.episodes.length - 1) {
        setEpIndex(epIndex + 1);
        setBeatIndex(0);
        setPlacePreview(null);
      }
      return;
    }
    if (!isLastBeat) goBeat(beatIndex + 1);
  }, [episode, beat, series, epIndex, isLastBeat, beatIndex, goBeat]);

  const exitToCover = useCallback(() => {
    markRouteNavigation();
    window.location.assign(exodusCoverHref());
  }, []);

  const goPrev = useCallback(() => {
    if (beatIndex > 0) goBeat(beatIndex - 1);
  }, [beatIndex, goBeat]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (placePreview || askOpen || tocOpen || overviewOpen) return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') exitToCover();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placePreview, askOpen, tocOpen, overviewOpen, goNext, goPrev, exitToCover]);

  const onSwipeStart = (clientX: number, clientY: number, target: EventTarget | null) => {
    if (ignoreSwipe.current || placePreview || askOpen || tocOpen || overviewOpen) return;
    const inCaption = target instanceof Element && Boolean(target.closest('.story-beat-caption'));
    touchStart.current = { x: clientX, y: clientY, inCaption };
    setPullDy(0);
  };

  const onSwipeMove = (clientY: number) => {
    const start = touchStart.current;
    if (!start || start.inCaption) return;
    const dy = clientY - start.y;
    setPullDy(dy > 0 ? Math.min(dy, 120) : 0);
  };

  const onSwipeEnd = (clientX: number, clientY: number) => {
    const start = touchStart.current;
    touchStart.current = null;
    setPullDy(0);
    if (!start) return;
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (!start.inCaption && dy > 72 && absY > absX * 1.15) {
      exitToCover();
      return;
    }
    if (absX < SWIPE_MIN || absX < absY) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  const openRef = () => {
    if (!beat?.ref) return;
    setPreview({
      osis: refSpaceToOsis(beat.ref.replace(/\./g, ' ')),
      label: formatGroupRefLabel(beat.ref) || beat.ref,
    });
  };

  const onPlaceClick = (place: GeoPlace) => {
    if (!episode) return;
    ignoreSwipe.current = true;
    window.setTimeout(() => {
      ignoreSwipe.current = false;
    }, 300);
    const idx = findBeatIndexByPlace(episode, place.id);
    const target = idx >= 0 ? episode.beats[idx] : null;
    setPlacePreview({
      placeId: place.id,
      title: target?.title || place.name || place.id,
      narration: target?.narration || '路线上的一站（传统示意位置）。',
      beatIndex: idx,
    });
  };

  const onHotspotClick = (hotspotId: string) => {
    if (!episode) return;
    const idx = findBeatIndexByHotspot(episode, hotspotId);
    if (idx >= 0 && idx !== beatIndex) {
      setPlacePreview({
        placeId: hotspotId,
        title: episode.beats[idx]!.title,
        narration: episode.beats[idx]!.narration,
        beatIndex: idx,
      });
    }
  };

  const shareSeries = async () => {
    setShareHint(null);
    try {
      const result = await shareKnowledgeTour({
        kind: 'map',
        id: 'exodus-wilderness',
        title: series.title,
        body: series.closing,
        footer: `三章 · 约 ${series.minutes} 分钟 · 彼爱`,
        badge: '出埃及系列',
      });
      if (result === 'cancelled') return;
      setShareHint(result === 'copied' ? '已复制链接与摘要' : '已调起分享');
    } catch {
      setShareHint('分享未完成');
    }
  };

  if (!episode || !beat) {
    return (
      <main className="container">
        <p className="muted">未找到该章。</p>
        <Link href={exodusCoverHref()} className="text-link">返回系列封面 ›</Link>
      </main>
    );
  }

  const askQ = knowledgeAskQuestion({
    title: `${series.title} · ${episode.title}`,
    stopLabel: beat.title,
    askSeed: beat.ask_seed,
    ref: beat.ref,
  });

  const progressLabel = `${beatIndex + 1}/${beats.length}`;

  return (
    <main className="story-album-player">
      <header
        className="story-album-player-bar"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <Link
          href={exodusCoverHref()}
          className="story-album-player-close"
          aria-label="关闭并返回封面"
          onClick={() => markRouteNavigation()}
        >
          关闭
        </Link>
        <p className="story-album-player-bar-mid">
          第 {epIndex + 1} 幕 · {episode.title}
        </p>
        <button type="button" className="story-album-player-toc" onClick={() => setTocOpen(true)}>
          目录
        </button>
      </header>

      <div
        className="story-album-stage"
        onTouchStart={(e) =>
          onSwipeStart(e.touches[0]?.clientX ?? 0, e.touches[0]?.clientY ?? 0, e.target)
        }
        onTouchMove={(e) => onSwipeMove(e.touches[0]?.clientY ?? 0)}
        onTouchEnd={(e) => onSwipeEnd(e.changedTouches[0]?.clientX ?? 0, e.changedTouches[0]?.clientY ?? 0)}
      >
        {pullDy > 8 ? (
          <p className="story-album-pull-hint" style={{ opacity: Math.min(1, pullDy / 72) }}>
            下拉退出
          </p>
        ) : null}
        <article
          className="story-beat-frame"
          style={
            pullDy > 0
              ? { transform: `translateY(${pullDy * 0.35}px)`, opacity: Math.max(0.55, 1 - pullDy / 220) }
              : undefined
          }
        >
          <div className="story-beat-visual">
            <button
              type="button"
              className="story-album-edge story-album-edge-left"
              aria-label="上一拍"
              onClick={goPrev}
            />
            <BeatVisual
              beat={beat}
              episode={episode}
              mapPlaces={mapPlaces}
              routeStops={routeStops}
              diagram={diagram}
              onPlaceClick={onPlaceClick}
              onHotspotClick={onHotspotClick}
            />
            <button
              type="button"
              className="story-album-edge story-album-edge-right"
              aria-label="下一拍"
              onClick={goNext}
            />
          </div>
          <div className="story-beat-caption">
            <h2 className="story-beat-caption-title">{beat.title}</h2>
            <p className="story-beat-caption-narration">{beat.narration}</p>
            {beat.insight ? (
              <div className="story-beat-caption-insight-block">
                <button
                  type="button"
                  className="story-beat-caption-insight-toggle"
                  aria-expanded={insightOpen}
                  onClick={() => setInsightOpen((v) => !v)}
                >
                  {insightOpen ? '收起洞察' : '再想一层'}
                </button>
                {insightOpen ? (
                  <p className="story-beat-caption-insight">{beat.insight}</p>
                ) : null}
              </div>
            ) : null}
            <div className="story-beat-caption-links">
              {beat.ref ? (
                <button type="button" className="story-beat-caption-link" onClick={openRef}>
                  {formatGroupRefLabel(beat.ref) || beat.ref}
                </button>
              ) : null}
              {beat.ask_seed || beat.media === 'map' || beat.media === 'diagram' || beat.media === 'portrait' ? (
                <button type="button" className="story-beat-caption-link" onClick={() => setAskOpen(true)}>
                  问小爱
                </button>
              ) : null}
              {beat.media === 'map' ? (
                <button type="button" className="story-beat-caption-link" onClick={() => setOverviewOpen(true)}>
                  全程
                </button>
              ) : null}
            </div>
          </div>
        </article>
      </div>

      <footer className="story-album-footer">
        <div className="story-album-dots" aria-label={`进度 ${progressLabel}`}>
          {beats.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className={`story-album-dot${i === beatIndex ? ' is-active' : ''}${i < beatIndex ? ' is-done' : ''}`}
              aria-label={`第 ${i + 1} 拍`}
              onClick={() => goBeat(i)}
            />
          ))}
        </div>
        <p className="story-album-progress-label">{progressLabel}</p>
        {beat.media === 'fin' ? (
          <div className="story-album-footer-actions">
            {beat.fin_kind === 'series' ? (
              <>
                <button type="button" className="font-pill accent" onClick={() => void shareSeries()}>
                  分享这程
                </button>
                <Link
                  href={exodusCoverHref()}
                  className="font-pill knowledge-story-end-pill-link"
                  onClick={() => markRouteNavigation()}
                >
                  回封面
                </Link>
              </>
            ) : (
              <button type="button" className="font-pill accent" onClick={goNext}>
                下一幕：{series.episodes[epIndex + 1]?.title ?? ''} ›
              </button>
            )}
          </div>
        ) : null}
        {shareHint ? <p className="muted story-album-share-hint">{shareHint}</p> : null}
      </footer>

      {placePreview ? (
        <div className="sheet-backdrop" onClick={() => setPlacePreview(null)}>
          <div className="sheet card half-sheet story-album-place-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="half-sheet-title">
              <strong>{placePreview.title}</strong>
              <SheetCloseButton onClick={() => setPlacePreview(null)} />
            </div>
            <div className="half-sheet-body">
              <p className="story-album-place-note">{placePreview.narration}</p>
              <div className="half-sheet-actions">
                {placePreview.beatIndex >= 0 && placePreview.beatIndex !== beatIndex ? (
                  <button
                    type="button"
                    className="font-pill accent"
                    onClick={() => {
                      goBeat(placePreview.beatIndex);
                      setPlacePreview(null);
                    }}
                  >
                    跳到这一拍 ›
                  </button>
                ) : (
                  <button type="button" className="font-pill" onClick={() => setPlacePreview(null)}>
                    收起
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tocOpen ? (
        <div className="sheet-backdrop" onClick={() => setTocOpen(false)}>
          <div className="sheet card half-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="half-sheet-title">
              <strong>本幕目录 · {episode.title}</strong>
              <SheetCloseButton onClick={() => setTocOpen(false)} />
            </div>
            <div className="half-sheet-body">
              <ul className="story-album-toc-list">
                {beats.map((b, i) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={`story-album-toc-item${i === beatIndex ? ' is-active' : ''}`}
                      onClick={() => {
                        goBeat(i);
                        setTocOpen(false);
                      }}
                    >
                      <span>{i + 1}. {b.title}</span>
                      <span className="muted">{b.media}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {overviewOpen && tour ? (
        <div className="sheet-backdrop" onClick={() => setOverviewOpen(false)}>
          <div className="sheet card half-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="half-sheet-title">
              <strong>路线总览</strong>
              <SheetCloseButton onClick={() => setOverviewOpen(false)} />
            </div>
            <div className="half-sheet-body">
              <GeoMiniMap
                places={mapPlaces}
                activeId={beat.place_id}
                height={220}
                routeStops={routeStops}
                onPlaceClick={(p) => {
                  setOverviewOpen(false);
                  onPlaceClick(p);
                }}
              />
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                点站点可预览并跳到对应拍。此处可缩放拖动。
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {askOpen ? (
        <KnowledgeAskSheet
          title={`${episode.title} · ${beat.title}`}
          question={askQ}
          refParam={beat.ref}
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
    </main>
  );
}

function BeatVisual({
  beat,
  episode,
  mapPlaces,
  routeStops,
  diagram,
  onPlaceClick,
  onHotspotClick,
}: {
  beat: StoryBeat;
  episode: StoryEpisode;
  mapPlaces: GeoPlace[];
  routeStops: { placeId: string; order: number; label?: string }[];
  diagram: BibleDiagram | null;
  onPlaceClick: (p: GeoPlace) => void;
  onHotspotClick: (id: string) => void;
  onOpenOverview?: () => void;
}) {
  if (beat.media === 'cover') {
    return (
      <div className="story-beat-cover">
        <p className="story-beat-cover-badge">出埃及故事</p>
        <p className="story-beat-cover-hook">{episode.hook}</p>
      </div>
    );
  }

  if (beat.media === 'quote') {
    return (
      <div className="story-beat-quote">
        <p className="story-beat-quote-mark" aria-hidden>“</p>
      </div>
    );
  }

  if (beat.media === 'fin') {
    return (
      <div className="story-beat-fin">
        <p className="story-beat-fin-badge">
          {beat.fin_kind === 'series' ? '系列完成' : '本章完成'}
        </p>
      </div>
    );
  }

  if (beat.media === 'portrait') {
    return (
      <div className="story-beat-portrait">
        <span className="story-beat-portrait-entity">{beat.entity_label}</span>
        {beat.relation ? (
          <span className="story-beat-portrait-rel">{beat.relation}</span>
        ) : null}
      </div>
    );
  }

  if (beat.media === 'map') {
    return (
      <div className="story-beat-map">
        {mapPlaces.length > 0 ? (
          <GeoMiniMap
            places={mapPlaces}
            activeId={beat.place_id}
            height={240}
            routeStops={routeStops}
            onPlaceClick={onPlaceClick}
            lockView
            hideActiveCard
            fitMode="route"
          />
        ) : (
          <p className="muted story-beat-map-loading">地图载入中…</p>
        )}
      </div>
    );
  }

  if (beat.media === 'diagram' && diagram) {
    const src = api.diagramFileUrl(diagram.id);
    const hotspots = diagram.hotspots ?? [];
    return (
      <div className="story-beat-diagram">
        <div className="diagram-viewer-frame story-beat-diagram-frame">
          <img src={src} alt={diagram.title} className="diagram-viewer-img" />
          {hotspots.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`diagram-hotspot${beat.hotspot_id === h.id ? ' is-active' : ''}`}
              style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
              aria-label={h.label}
              onClick={(e) => {
                e.stopPropagation();
                onHotspotClick(h.id);
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return <div className="story-beat-fallback muted">本拍视觉准备中</div>;
}
