'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { TopicNavCard } from '@/components/search/TopicNavCard';
import { KnowledgeTopicCardBody } from '@/components/search/KnowledgeTopicCardBody';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type BibleDiagram } from '@/lib/api';
import { FEATURED_DIAGRAM_IDS, diagramTourHref } from '@/lib/topic_routes';
import {
  EXODUS_SERIES,
  knowledgeCountMeta,
  knowledgeKindCta,
  knowledgeListLead,
  seriesStepHref,
  tourHook,
} from '@/lib/knowledge_story';
import {
  getKnowledgeProgress,
  knowledgeProgressLabel,
} from '@/lib/knowledge_progress';

export default function SearchDiagramsIndexPage() {
  useEdgeSwipeBack({ href: '/search' });
  const [items, setItems] = useState<BibleDiagram[]>([]);
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
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" />
        <h2 className="page-head-title">图鉴馆</h2>
      </header>
      <p className="muted story-mode-sub">{knowledgeListLead('diagram')}</p>
      <div className="topic-picker-list" style={{ marginTop: 14 }}>
        {loading ? <p className="muted">正在载入…</p> : null}
        {!loading && items.length === 0 ? (
          <p className="muted knowledge-empty">
            暂无图鉴。
            <Link href={seriesStepHref(EXODUS_SERIES.steps[0])} className="text-link">
              {' '}先走出埃及故事 ›
            </Link>
          </p>
        ) : null}
        {items.map((d) => {
          const n = d.hotspots?.length ?? 0;
          const row = getKnowledgeProgress('diagram', d.id);
          const progress =
            row && (row.completed || row.step > 0)
              ? knowledgeProgressLabel(row, '处')
              : null;
          return (
            <TopicNavCard
              key={d.id}
              href={diagramTourHref(d.id)}
              className="card card-2 topic-picker-card"
              ariaLabel={d.title}
            >
              <KnowledgeTopicCardBody
                badge="图鉴馆"
                badgeClassName="story-tour-badge-diagram"
                title={d.title}
                hook={tourHook(d.id) || d.summary}
                meta={n > 0 ? knowledgeCountMeta(n, 'diagram') : null}
                progress={progress}
                cta={
                  progress && !row?.completed
                    ? '继续走 ›'
                    : knowledgeKindCta('diagram')
                }
              />
            </TopicNavCard>
          );
        })}
      </div>
    </main>
  );
}
