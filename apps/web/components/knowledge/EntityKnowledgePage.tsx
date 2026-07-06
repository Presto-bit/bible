'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type DictEntity, type EntityKnowledge } from '@/lib/api';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import {
  defaultEntityKnowledgeTab,
  entityAnchorRef,
  entityAssistantQuestion,
  entityKnowledgeTabs,
} from '@/lib/entity_knowledge';
import type { EntityKnowledgeTab } from '@/lib/entity_knowledge';
import { EntityKnowledgeHeader, EntityKnowledgePanel } from '@/components/knowledge/EntityKnowledgePanel';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import { formatGroupRefLabel } from '@/lib/ref_label';

export function EntityKnowledgePage({
  entityId,
  backHref,
  backLabel,
}: {
  entityId: string;
  backHref: string;
  backLabel: string;
}) {
  useEdgeSwipeBack({ href: backHref });
  const router = useRouter();

  const [knowledge, setKnowledge] = useState<EntityKnowledge | null>(null);
  const [graphTopicId, setGraphTopicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<EntityKnowledgeTab>('refs');
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    void api
      .entityKnowledge(entityId)
      .then((data) => {
        if (cancelled) return;
        setKnowledge(data);
        setTab(defaultEntityKnowledgeTab(data.entity, data));
      })
      .catch(() => {
        if (!cancelled) {
          setKnowledge(null);
          setErr('词条加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  useEffect(() => {
    void api
      .graphTopics()
      .then((d) => {
        const hit = (d.topics ?? []).find((t) =>
          (t.entity_ids ?? []).includes(entityId),
        );
        setGraphTopicId(hit?.id ?? null);
      })
      .catch(() => setGraphTopicId(null));
  }, [entityId]);

  const entity = knowledge?.entity;
  const tabs = useMemo(
    () => (entity ? entityKnowledgeTabs(entity, knowledge) : []),
    [entity, knowledge],
  );

  const handleNodeClick = (nodeId: string) => {
    router.push(`/dictionary/${encodeURIComponent(nodeId)}`);
  };

  const askAssistant = () => {
    if (!entity) return;
    navigateToAssistant(entityAnchorRef(entity), {
      question: entityAssistantQuestion(entity, { knowledge }),
      autoSend: true,
      scene: 'entity_knowledge',
    });
  };

  if (err && !entity) {
    return (
      <main className="container">
        <header className="page-head">
          <PageBackBar href={backHref} label={backLabel} />
          <h2 className="page-head-title">词条</h2>
        </header>
        <p className="muted" style={{ marginTop: 16 }}>{err}</p>
      </main>
    );
  }

  if (!entity) {
    return (
      <main className="container">
        <header className="page-head">
          <PageBackBar href={backHref} label={backLabel} />
          <h2 className="page-head-title">词条</h2>
        </header>
        <p className="muted" style={{ marginTop: 16 }}>加载中…</p>
      </main>
    );
  }

  return (
    <main className="container entity-knowledge-page">
      <header className="page-head">
        <PageBackBar href={backHref} label={backLabel} />
        <h2 className="page-head-title">{entity.name}</h2>
      </header>

      <div className="card card-2" style={{ marginTop: 12, padding: 14 }}>
        <EntityKnowledgeHeader entity={entity} />
        <EntityKnowledgePanel
          entity={entity}
          knowledge={knowledge}
          loading={loading}
          tab={tab}
          onTabChange={setTab}
          tabs={tabs}
          onRefPreview={(osis, label) => setPreview({ osis, label })}
          onNodeClick={handleNodeClick}
          graphTopicId={graphTopicId}
        />
      </div>

      <div className="entity-knowledge-foot" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={askAssistant}>
          问小爱
        </button>
        {graphTopicId ? (
          <Link
            href={`/search/graph?topic=${encodeURIComponent(graphTopicId)}`}
            className="btn"
            style={{ flex: 1, textAlign: 'center' }}
          >
            关系专题
          </Link>
        ) : (
          <Link href="/search/graph" className="btn" style={{ flex: 1, textAlign: 'center' }}>
            关系专题
          </Link>
        )}
      </div>

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
