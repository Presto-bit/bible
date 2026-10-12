'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api, type KnowledgeLayout, type MapTour } from '@/lib/api';
import { MapStoryMode } from '@/components/search/MapStoryMode';
import { KnowledgeExplainerPage } from '@/components/knowledge/KnowledgeExplainerPage';
import {
  isKnowledgeExpandActive,
  peekKnowledgeExpandCover,
  releaseKnowledgeImmersiveChrome,
  revealKnowledgeExpand,
} from '@/lib/knowledge_nav';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';
import {
  isJourneyManuscriptId,
  journeyManuscriptCover,
} from '@/lib/journey_covers';
import {
  peekKnowledgeDetail,
  putKnowledgeDetail,
  stubTourFromLayout,
  warmManuscriptRasters,
} from '@/lib/knowledge_detail_cache';

function LoadingSilent({ tourId }: { tourId: string }) {
  const cover = useMemo(() => {
    // 必须与手稿第 1 页一致，避免「占位图 ≠ 最终图」
    if (tourId && isJourneyManuscriptId(tourId)) {
      return journeyManuscriptCover(tourId);
    }
    return peekKnowledgeExpandCover();
  }, [tourId]);
  const sources = cover ? knowledgeRasterSources(cover) : null;
  const [src, setSrc] = useState(() => sources?.webp || sources?.fallback || '');
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    setSrc(sources?.webp || sources?.fallback || '');
  }, [sources?.webp, sources?.fallback]);

  useEffect(() => {
    const t = window.setTimeout(() => setStuck(true), 10000);
    return () => window.clearTimeout(t);
  }, [tourId]);

  if (stuck) {
    return (
      <main className="container" style={{ paddingTop: 48 }}>
        <p className="muted">加载较慢，请返回重试。</p>
        <p style={{ marginTop: 12 }}>
          <a className="text-link" href="/discover?pane=explore">
            返回探索 ›
          </a>
        </p>
      </main>
    );
  }

  return (
    <div className="knowledge-expand-silent" aria-busy="true">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="knowledge-expand-silent-cover"
          src={src}
          alt=""
          decoding="async"
          fetchPriority="high"
          onError={() => {
            if (sources?.fallback && src !== sources.fallback) {
              setSrc(sources.fallback);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function MapStoryPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tourId = decodeURIComponent(String(params.tourId || ''));
  const forceTour = searchParams.get('mode') === 'tour';
  const openView = searchParams.get('view') === '1';

  const cached = tourId ? peekKnowledgeDetail(tourId) : null;
  const [tour, setTour] = useState<MapTour | null>(() => cached?.tour ?? null);
  const [layout, setLayout] = useState<KnowledgeLayout | null>(
    () => cached?.layout ?? null,
  );
  const [loading, setLoading] = useState(() => !cached?.layout && !cached?.tour);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tourId) {
      setLoading(false);
      setFailed(true);
      return;
    }

    const warm = peekKnowledgeDetail(tourId);
    if (warm?.layout || warm?.tour) {
      if (warm.tour) setTour(warm.tour);
      if (warm.layout) {
        setLayout(warm.layout);
        warmManuscriptRasters(warm.layout, tourId);
      }
      setLoading(false);
      setFailed(false);
    } else {
      setLoading(true);
      setFailed(false);
      if (isJourneyManuscriptId(tourId)) {
        warmManuscriptRasters(null, tourId);
      }
    }

    let cancelled = false;
    const layoutP = api
      .knowledgeLayout(tourId)
      .then((r) => r.layout)
      .catch(() => null);
    const tourP = api
      .mapTour(tourId)
      .then((r) => r.tour)
      .catch(() => null);

    // layout 先到先开手稿，勿被 mapTour 拖慢
    void layoutP.then((nextLayout) => {
      if (cancelled || !nextLayout) return;
      setLayout(nextLayout);
      warmManuscriptRasters(nextLayout, tourId);
      const prev = peekKnowledgeDetail(tourId);
      putKnowledgeDetail(tourId, {
        tour: prev?.tour ?? null,
        layout: nextLayout,
      });
      setLoading(false);
    });

    void tourP.then((nextTour) => {
      if (cancelled || !nextTour) return;
      setTour(nextTour);
      const prev = peekKnowledgeDetail(tourId);
      putKnowledgeDetail(tourId, {
        tour: nextTour,
        layout: prev?.layout ?? null,
      });
      if (!peekKnowledgeDetail(tourId)?.layout) setLoading(false);
    });

    void Promise.all([layoutP, tourP]).then(([nextLayout, nextTour]) => {
      if (cancelled) return;
      if (nextLayout || nextTour) {
        putKnowledgeDetail(tourId, { tour: nextTour, layout: nextLayout });
        setLoading(false);
        return;
      }
      if (!peekKnowledgeDetail(tourId)?.layout && !peekKnowledgeDetail(tourId)?.tour) {
        setFailed(true);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tourId]);

  useEffect(() => {
    if (!failed) return;
    revealKnowledgeExpand();
    releaseKnowledgeImmersiveChrome();
  }, [failed]);

  if (loading) {
    if (
      openView ||
      isKnowledgeExpandActive() ||
      peekKnowledgeExpandCover() ||
      isJourneyManuscriptId(tourId)
    ) {
      return <LoadingSilent tourId={tourId} />;
    }
    return (
      <main className="container story-mode-page" aria-busy="true">
        <p className="muted">正在载入…</p>
      </main>
    );
  }

  const effectiveTour =
    tour || (layout ? stubTourFromLayout(layout, tourId) : null);

  if (failed || !effectiveTour) {
    return (
      <main className="container">
        <p className="muted">未找到该地图故事</p>
      </main>
    );
  }

  const useExplainer = !forceTour && Boolean(layout?.beats?.length);

  return (
    <main className={`container story-mode-page${useExplainer ? ' knowledge-explainer-page' : ''}`}>
      {useExplainer && layout ? (
        <KnowledgeExplainerPage
          tour={effectiveTour}
          layout={layout}
          backHref="/discover?pane=explore"
          backLabel="知识专题"
          autoOpen={openView}
        />
      ) : (
        <MapStoryMode tourId={tourId} backHref="/search/map" backLabel="地图故事" />
      )}
    </main>
  );
}

export default function MapStoryPage() {
  return (
    <Suspense fallback={<div className="knowledge-expand-silent" aria-busy="true" />}>
      <MapStoryPageContent />
    </Suspense>
  );
}
