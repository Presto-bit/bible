'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type EntityGraph, type GraphTopic } from '@/lib/api';
import { LocalRelationGraph } from '@/components/knowledge/LocalRelationGraph';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { graphTopicAssistantQuestion } from '@/lib/entity_knowledge';
import PageBackBar from '@/components/PageBackBar';

const NARRATIVE_EDGE_MAX = 12;

export function GraphTopicView({
  topicId,
  backHref = '/search',
  backLabel = '搜索',
}: {
  topicId: string;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState<GraphTopic | null>(null);
  const [graph, setGraph] = useState<EntityGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    void api
      .graphTopic(topicId)
      .then((d) => {
        setTopic(d.topic);
        const center = d.graph.nodes.find((n) => (d.topic.entity_ids ?? []).includes(n.id))
          ?? d.graph.nodes[0];
        setGraph({
          center: center
            ? { id: center.id, name: center.name, type: center.type, summary: '', refs: [] }
            : null,
          nodes: d.graph.nodes,
          edges: d.graph.edges,
        });
      })
      .catch(() => {
        setTopic(null);
        setGraph(null);
      })
      .finally(() => setLoading(false));
  }, [topicId]);

  const handleRefClick = (osis: string, label: string) => {
    const href = readerHrefFromRef(osis);
    if (href) window.location.href = href;
    else setPreview({ osis, label });
  };

  if (loading) {
    return <p className="muted">加载关系专题…</p>;
  }
  if (!topic || !graph) {
    return <p className="muted">未找到该专题</p>;
  }

  const useNarrative = graph.edges.length <= NARRATIVE_EDGE_MAX;

  return (
    <>
      <header className="page-head story-mode-head">
        <PageBackBar href={backHref} label={backLabel} />
        <h2 className="page-head-title">{topic.title}</h2>
      </header>
      {topic.subtitle ? (
        <p className="muted story-mode-sub">{topic.subtitle}</p>
      ) : null}

      <div className="story-mode-actions" style={{ marginTop: 0, marginBottom: 12 }}>
        <button
          type="button"
          className="font-pill accent"
          onClick={() => navigateToAssistant(undefined, {
            question: graphTopicAssistantQuestion(topic),
            autoSend: true,
            scene: 'graph_topic',
            surface: 'graph_topic',
          })}
        >
          问小爱理清关系
        </button>
      </div>

      {useNarrative ? (
        <ol className="relation-narrative-list">
          {graph.edges.map((edge, idx) => {
            const from = graph.nodes.find((n) => n.id === edge.from);
            const to = graph.nodes.find((n) => n.id === edge.to);
            const ref = edge.refs?.[0];
            return (
              <li key={`${edge.from}-${edge.to}-${idx}`} className="card card-2 relation-narrative-card">
                <p className="relation-narrative-line">
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => router.push(`/graph/${encodeURIComponent(edge.from)}`)}
                  >
                    {from?.name ?? edge.from}
                  </button>
                  <span className="relation-narrative-mid"> {edge.label || '相关'} </span>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => router.push(`/graph/${encodeURIComponent(edge.to)}`)}
                  >
                    {to?.name ?? edge.to}
                  </button>
                </p>
                {ref ? (
                  <button
                    type="button"
                    className="story-step-cta"
                    onClick={() => handleRefClick(ref, formatGroupRefLabel(ref) || ref)}
                  >
                    读这段 · {formatGroupRefLabel(ref) || ref}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <LocalRelationGraph
          graph={graph}
          variant="fullscreen"
          onNodeClick={(nodeId) => {
            if (graph.center?.id === nodeId) return;
            router.push(`/graph/${encodeURIComponent(nodeId)}`);
          }}
          onRefClick={handleRefClick}
        />
      )}

      <div className="story-mode-footer-links">
        <Link href="/search/graph" className="text-link">切换专题</Link>
      </div>

      {preview ? (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}
