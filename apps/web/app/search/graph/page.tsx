'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type EntityGraph, type GraphTopic } from '@/lib/api';
import { LocalRelationGraph } from '@/components/knowledge/LocalRelationGraph';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import {
  graphTopicAssistantQuestion,
} from '@/lib/entity_knowledge';

function SearchGraphContent() {
  useEdgeSwipeBack({ href: '/search' });
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicParam = searchParams.get('topic');

  const [topics, setTopics] = useState<GraphTopic[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [graph, setGraph] = useState<EntityGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    void api
      .graphTopics()
      .then((d) => {
        const list = d.topics ?? [];
        setTopics(list);
        const initial = topicParam && list.some((t) => t.id === topicParam)
          ? topicParam
          : list[0]?.id ?? null;
        setOpenId(initial);
      })
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, [topicParam]);

  useEffect(() => {
    if (!openId) {
      setGraph(null);
      return;
    }
    void api
      .graphTopic(openId)
      .then((d) => {
        const center = d.graph.nodes.find((n) => (d.topic.entity_ids ?? []).includes(n.id)) ?? d.graph.nodes[0];
        setGraph({
          center: center
            ? { id: center.id, name: center.name, type: center.type, summary: '', refs: [] }
            : null,
          nodes: d.graph.nodes,
          edges: d.graph.edges,
        });
      })
      .catch(() => setGraph(null));
  }, [openId]);

  const openTopic = topics.find((t) => t.id === openId);

  const handleRefClick = (osis: string, label: string) => {
    const href = readerHrefFromRef(osis);
    if (href) window.location.href = href;
    else setPreview({ osis, label });
  };

  const askTopicAssistant = () => {
    if (!openTopic) return;
    navigateToAssistant(undefined, {
      question: graphTopicAssistantQuestion(openTopic),
      autoSend: true,
      scene: 'graph_topic',
      surface: 'graph_topic',
    });
  };

  return (
    <main className="container entity-graph-page">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" />
        <h2 className="page-head-title">关系专题</h2>
      </header>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        预设人物与地点关系子图；可筛选关系类型、点节点切换中心或查看词条。
      </p>

      {loading ? <p className="muted">加载中…</p> : null}

      <div className="chip-row" style={{ marginTop: 12 }}>
        {topics.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`book-chip${openId === t.id ? ' is-active' : ''}`}
            style={{ width: 'auto' }}
            onClick={() => setOpenId(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>

      {openTopic ? (
        <div className="card card-2" style={{ marginTop: 14, padding: 12 }}>
          <div className="section-row" style={{ marginTop: 0 }}>
            <div>
              <strong>{openTopic.title}</strong>
              {openTopic.subtitle ? (
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{openTopic.subtitle}</p>
              ) : null}
            </div>
            <button type="button" className="font-pill accent" onClick={askTopicAssistant}>
              问小爱理清关系
            </button>
          </div>
          {graph ? (
            <div style={{ marginTop: 12 }}>
              <LocalRelationGraph
                graph={graph}
                variant="fullscreen"
                onNodeClick={(nodeId) => {
                  if (graph.center?.id === nodeId) return;
                  router.push(`/graph/${encodeURIComponent(nodeId)}`);
                }}
                onRefClick={handleRefClick}
              />
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>加载关系图…</p>
          )}
        </div>
      ) : null}

      {preview ? (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </main>
  );
}

export default function SearchGraphPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <SearchGraphContent />
    </Suspense>
  );
}
