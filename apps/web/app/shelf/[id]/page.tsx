'use client';

import dynamic from 'next/dynamic';
import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';

const ShelfReader = dynamic(() => import('@/components/shelf/ShelfReader'), {
  ssr: false,
  loading: () => (
    <main className="shelf-reader">
      <p className="muted" style={{ padding: 24 }}>加载阅读器…</p>
    </main>
  ),
});

export default function ShelfBookPage({ params }: { params: Promise<{ id: string }> }) {
  const suppress = useSuppressKeepAliveRoute();
  if (suppress) return null;
  return (
    <Suspense fallback={<main className="shelf-reader"><p className="muted">加载中…</p></main>}>
      <ShelfBookInner params={params} />
    </Suspense>
  );
}

function ShelfBookInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const section = search.get('section');
  const pageRaw = search.get('page');
  const initialPageIndex = pageRaw ? Math.max(0, Number(pageRaw) || 0) : undefined;
  return <ShelfReader bookId={id} initialSectionId={section} initialPageIndex={initialPageIndex} />;
}
