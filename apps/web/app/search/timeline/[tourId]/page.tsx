'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { TimelineStoryMode } from '@/components/search/TimelineStoryMode';

function TimelineStoryPageContent() {
  const params = useParams();
  const tourId = decodeURIComponent(String(params.tourId || ''));
  useEdgeSwipeBack({ href: '/search/timeline' });

  return (
    <main className="container story-mode-page">
      <TimelineStoryMode tourId={tourId} backHref="/search/timeline" backLabel="时间故事" />
    </main>
  );
}

export default function TimelineStoryPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <TimelineStoryPageContent />
    </Suspense>
  );
}
