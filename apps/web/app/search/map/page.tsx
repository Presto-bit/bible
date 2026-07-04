'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type MapTour } from '@/lib/api';
import { MapTourPanels } from '@/components/search/StoryTourPanels';

export default function SearchMapStoriesPage() {
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
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/search" className="muted">‹ 搜索</Link>
        <strong>地图故事</strong>
        <span />
      </div>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        圣经地理路线专题，点开卡片查看站点与经文。
      </p>
      <div style={{ marginTop: 14 }}>
        {loading ? <p className="muted">加载中…</p> : <MapTourPanels tours={tours} />}
      </div>
    </main>
  );
}
