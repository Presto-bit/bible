'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api, type KnowledgeLayout, type MapTour } from '@/lib/api';
import { MapStoryMode } from '@/components/search/MapStoryMode';
import { KnowledgeExplainerPage } from '@/components/knowledge/KnowledgeExplainerPage';
import {
  isKnowledgeExpandActive,
  peekKnowledgeExpandCover,
} from '@/lib/knowledge_nav';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';
import {
  isJourneyManuscriptId,
  journeyManuscriptCover,
} from '@/lib/journey_covers';

function LoadingSilent({ tourId }: { tourId: string }) {
  const cover = useMemo(() => {
    // 必须与手稿第 1 页一致，避免「占位图 ≠ 最终图」
    if (tourId && isJourneyManuscriptId(tourId)) {
      return journeyManuscriptCover(tourId);
    }
    return peekKnowledgeExpandCover();
  }, [tourId]);
  const sources = cover ? knowledgeRasterSources(cover) : null;

  return (
    <div className="knowledge-expand-silent" aria-busy="true">
      {sources ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="knowledge-expand-silent-cover"
          src={sources.webp || sources.fallback}
          alt=""
          decoding="async"
          onError={(e) => {
            const img = e.currentTarget;
            if (sources.fallback && img.src !== sources.fallback) {
              img.src = sources.fallback;
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

  const [tour, setTour] = useState<MapTour | null>(null);
  const [layout, setLayout] = useState<KnowledgeLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tourId) {
      setLoading(false);
      setFailed(true);
      return;
    }
    setLoading(true);
    setFailed(false);
    setTour(null);
    setLayout(null);

    // 预热手稿总图（与第 1 页 / 占位同一张）
    if (isJourneyManuscriptId(tourId)) {
      const warm = knowledgeRasterSources(journeyManuscriptCover(tourId));
      const img = new Image();
      img.decoding = 'async';
      img.src = warm.webp || warm.fallback;
      img.onerror = () => {
        if (warm.webp) {
          const fb = new Image();
          fb.src = warm.fallback;
        }
      };
    }

    void Promise.all([
      api.mapTour(tourId),
      api.knowledgeLayout(tourId).catch(() => null),
    ])
      .then(([tourRes, layoutRes]) => {
        setTour(tourRes.tour);
        setLayout(layoutRes?.layout ?? null);
      })
      .catch(() => {
        setTour(null);
        setLayout(null);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [tourId]);

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

  if (failed || !tour) {
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
          tour={tour}
          layout={layout}
          backHref="/knowledge"
          backLabel="知识专题"
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
