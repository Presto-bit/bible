'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api, type KnowledgeLayout, type MapTour } from '@/lib/api';
import { MapStoryMode } from '@/components/search/MapStoryMode';
import { KnowledgeExplainerPage } from '@/components/knowledge/KnowledgeExplainerPage';
import { KnowledgeExpandBoot } from '@/components/knowledge/KnowledgeExpandBoot';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';

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

    const warm = knowledgeRasterSources(
      `/knowledge/infographics/${encodeURIComponent(tourId)}-comic.png`,
    );
    if (warm.webp) {
      const img = new Image();
      img.decoding = 'async';
      img.src = warm.webp;
    }
    {
      const img = new Image();
      img.decoding = 'async';
      img.src = warm.fallback;
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
    if (openView) {
      const fallback =
        tourId === 'exodus-wilderness'
          ? '/knowledge/vignettes/wilderness/00_overview.png'
          : `/knowledge/infographics/${encodeURIComponent(tourId)}.png`;
      return (
        <KnowledgeExpandBoot fallbackCover={fallback} label="打开手稿…" />
      );
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
    <Suspense
      fallback={
        <div
          className="knowledge-expand-boot is-ready"
          role="status"
          aria-busy="true"
          aria-label="打开手稿…"
        />
      }
    >
      <MapStoryPageContent />
    </Suspense>
  );
}
