'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import DevotionalSeriesClient from '@/components/devotionals/DevotionalSeriesClient';
import { GENESIS_50_SERIES_ID } from '@/lib/devotional_local';

export default function DevotionalSeriesPage() {
  const params = useParams();
  const seriesId = String(params?.seriesId || GENESIS_50_SERIES_ID);
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <DevotionalSeriesClient seriesId={seriesId} />
    </Suspense>
  );
}
