'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { TimelineStoryMode } from '@/components/search/TimelineStoryMode';

function TimelineStoryPageContent() {
  const params = useParams();
  const tourId = decodeURIComponent(String(params.tourId || ''));

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
