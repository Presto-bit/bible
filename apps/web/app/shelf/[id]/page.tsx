'use client';

import dynamic from 'next/dynamic';
import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';

const ShelfBookDetail = dynamic(() => import('@/components/shelf/ShelfBookDetail'), {
  ssr: false,
  loading: () => (
    <main className="shelf-detail-page">
      <p className="muted" style={{ padding: 24 }}>加载中…</p>
    </main>
  ),
});

export default function ShelfBookPage({ params }: { params: Promise<{ id: string }> }) {
  const suppress = useSuppressKeepAliveRoute();
  if (suppress) return null;
  return (
    <Suspense fallback={<main className="shelf-detail-page"><p className="muted">加载中…</p></main>}>
      <ShelfBookDetailInner params={params} />
    </Suspense>
  );
}

function ShelfBookDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ShelfBookDetail bookId={id} />;
}
