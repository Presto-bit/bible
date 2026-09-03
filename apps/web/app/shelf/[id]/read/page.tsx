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

export default function ShelfBookReadPage({ params }: { params: Promise<{ id: string }> }) {
  const suppress = useSuppressKeepAliveRoute();
  if (suppress) return null;
  return (
    <Suspense fallback={<main className="shelf-reader"><p className="muted">加载中…</p></main>}>
      <ShelfBookReadInner params={params} />
    </Suspense>
  );
}

function ShelfBookReadInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const section = search.get('section');
  const group = search.get('group');
  const pageRaw = search.get('page');
  const initialPageIndex = pageRaw != null && pageRaw !== '' ? Number(pageRaw) : null;
  return (
    <ShelfReader
      bookId={id}
      initialSectionId={section}
      initialPageIndex={Number.isFinite(initialPageIndex) ? initialPageIndex : null}
      presetGroupId={group}
    />
  );
}
