'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { MapStoryMode } from '@/components/search/MapStoryMode';

function MapStoryPageContent() {
  const params = useParams();
  const tourId = decodeURIComponent(String(params.tourId || ''));
  useEdgeSwipeBack({ href: '/search/map' });

  return (
    <main className="container story-mode-page">
      <MapStoryMode tourId={tourId} backHref="/search/map" backLabel="地图故事" />
    </main>
  );
}

export default function MapStoryPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <MapStoryPageContent />
    </Suspense>
  );
}
