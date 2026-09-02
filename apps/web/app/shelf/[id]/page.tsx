'use client';

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import ShelfReader from '@/components/shelf/ShelfReader';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';

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
  return <ShelfReader bookId={id} initialSectionId={section} />;
}
