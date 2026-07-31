'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { TopicNavCard } from '@/components/search/TopicNavCard';
import { KnowledgeTopicCardBody } from '@/components/search/KnowledgeTopicCardBody';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type GraphTopic } from '@/lib/api';
import { FEATURED_GRAPH_TOPICS, graphTopicHref } from '@/lib/topic_routes';
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

export default function SearchGraphIndexPage() {
  useEdgeSwipeBack({ href: '/search' });
  const [topics, setTopics] = useState<GraphTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .graphTopics()
      .then((d) => {
        const list = d.topics ?? [];
        const featured = FEATURED_GRAPH_TOPICS
          .map((id) => list.find((t) => t.id === id))
          .filter((t): t is GraphTopic => Boolean(t));
        setTopics(featured.length ? featured : list.slice(0, 3));
      })
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" />
        <h2 className="page-head-title">关系专题</h2>
      </header>
      <p className="muted story-mode-sub">{knowledgeListLead('graph')}</p>
      <div className="topic-picker-list" style={{ marginTop: 14 }}>
        {loading ? <p className="muted">正在载入…</p> : null}
        {!loading && topics.length === 0 ? (
          <p className="muted knowledge-empty">
            暂无关系专题。
            <Link href={seriesStepHref(EXODUS_SERIES.steps[0])} className="text-link">
              {' '}先走出埃及故事 ›
            </Link>
          </p>
        ) : null}
        {topics.map((t) => {
          const n = t.beats?.length ?? 0;
          const row = getKnowledgeProgress('graph', t.id);
          const progress =
            row && (row.completed || row.step > 0)
              ? knowledgeProgressLabel(row, '段')
              : null;
          return (
            <TopicNavCard
              key={t.id}
              href={graphTopicHref(t.id)}
              className="card card-2 topic-picker-card"
              ariaLabel={t.title}
            >
              <KnowledgeTopicCardBody
                badge="关系专题"
                badgeClassName="story-tour-badge-graph"
                title={t.title}
                hook={tourHook(t.id) || t.subtitle}
                meta={n > 0 ? knowledgeCountMeta(n, 'graph') : null}
                progress={progress}
                cta={
                  progress && !row?.completed
                    ? '继续走 ›'
                    : knowledgeKindCta('graph')
                }
              />
            </TopicNavCard>
          );
        })}
      </div>
    </main>
  );
}
