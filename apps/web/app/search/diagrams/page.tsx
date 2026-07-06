'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type BibleDiagram } from '@/lib/api';
import { FEATURED_DIAGRAM_IDS, diagramTourHref } from '@/lib/topic_routes';

export default function SearchDiagramsIndexPage() {
  useEdgeSwipeBack({ href: '/search' });
  const [items, setItems] = useState<BibleDiagram[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .diagrams()
      .then((d) => {
        const all = d.items ?? [];
        const featured = FEATURED_DIAGRAM_IDS
          .map((id) => all.find((x) => x.id === id))
          .filter((x): x is BibleDiagram => Boolean(x));
        setItems(featured.length ? featured : all.slice(0, 4));
        setCategories(d.categories ?? []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const catLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" />
        <h2 className="page-head-title">图鉴馆</h2>
      </header>
      <p className="muted story-mode-sub">
        示意图可点热区，按顺序导读。
      </p>
      <div className="topic-picker-list" style={{ marginTop: 14 }}>
        {loading ? <p className="muted">加载中…</p> : null}
        {!loading && items.length === 0 ? <p className="muted">暂无图鉴</p> : null}
        {items.map((d) => (
          <Link
            key={d.id}
            href={diagramTourHref(d.id)}
            className="card card-2 topic-picker-card"
          >
            <span className="story-tour-badge story-tour-badge-diagram">图鉴馆</span>
            <strong className="story-tour-title">{d.title}</strong>
            <p className="muted story-tour-meta">
              {catLabel(d.category)}
              {(d.hotspots?.length ?? 0) > 0 ? ` · ${d.hotspots!.length} 处可点` : ''}
            </p>
            <span className="story-tour-toggle">开始游览 ›</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
