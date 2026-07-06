'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type MapTour } from '@/lib/api';
import { MapTourPanels } from '@/components/search/StoryTourPanels';

function SearchMapStoriesContent() {
  useEdgeSwipeBack({ href: '/search' });
  const searchParams = useSearchParams();
  const tourParam = searchParams.get('tour');

  const [tours, setTours] = useState<MapTour[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .mapTours()
      .then((d) => setTours(d.tours ?? []))
      .catch(() => setTours([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" />
        <h2 className="page-head-title">地图故事</h2>
      </header>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        圣经地理路线专题，展开可查看地图与站点经文。
      </p>
      <div style={{ marginTop: 14 }}>
        {loading ? (
          <p className="muted">加载中…</p>
        ) : (
          <MapTourPanels tours={tours} initialOpenId={tourParam} />
        )}
      </div>
    </main>
  );
}

export default function SearchMapStoriesPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <SearchMapStoriesContent />
    </Suspense>
  );
}
