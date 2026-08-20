'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type EntityKnowledge } from '@/lib/api';
import {
  entityDictionaryHref,
  type EntityKnowledgeFrom,
} from '@/lib/entity_knowledge';
import { entityDisplayName, entityTypeLabel } from '@/lib/dictionary_match';
import { LocalRelationGraph } from './LocalRelationGraph';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';

export function EntityGraphPage({
  entityId,
  from: fromProp,
}: {
  entityId: string;
  from?: EntityKnowledgeFrom;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const from = (fromProp ?? sp.get('from') ?? undefined) as EntityKnowledgeFrom | undefined;
  const [knowledge, setKnowledge] = useState<EntityKnowledge | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);

  const entity = knowledge?.entity;
  const backHref = from === 'reader'
    ? undefined
    : entity
      ? entityDictionaryHref(entity)
      : '/dictionary';
  const backLabel = from === 'reader' ? '词条' : '词条';

  useEdgeSwipeBack({
    href: backHref ?? (from === 'reader' ? '/reader' : '/dictionary'),
    preferHistoryBack: from === 'reader',
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    void api
      .entityKnowledge(entityId, { graphLimit: 40 })
      .then((data) => {
        if (!cancelled) setKnowledge(data);
      })
      .catch(() => {
        if (!cancelled) {
          setKnowledge(null);
          setErr('关系图加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const handleNodeClick = (nodeId: string) => {
    if (nodeId === entityId) return;
    const q = from ? `?from=${from}` : '';
    router.push(`/graph/${encodeURIComponent(nodeId)}${q}`);
  };

  const goBack = () => {
    if (from === 'reader') {
      router.back();
      return;
    }
    if (backHref) router.push(backHref);
  };

  if (err && !entity) {
    return (
      <main className="container entity-graph-page">
        <header className="page-head">
          <PageBackBar href={backHref} label={from === 'reader' ? '读经' : '词典'} onClick={goBack} />
          <h2 className="page-head-title">关系图</h2>
        </header>
        <p className="muted" style={{ marginTop: 16 }}>{err}</p>
      </main>
    );
  }

  return (
    <main className="container entity-graph-page">
      <header className="page-head">
        <PageBackBar href={backHref} label={backLabel} onClick={goBack} />
        <h2 className="page-head-title">
          {entity ? `${entityDisplayName(entity)} · 关系` : '关系图'}
        </h2>
      </header>

      {entity ? (
        <p className="muted entity-graph-subtitle">
          {entityTypeLabel(entity.type)}
          {(knowledge?.graph?.edges?.length ?? 0) > 0
            ? ` · ${knowledge!.graph!.edges.length} 条关系`
            : ''}
        </p>
      ) : null}

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>加载中…</p>
      ) : knowledge?.graph ? (
        <LocalRelationGraph
          graph={knowledge.graph}
          variant="fullscreen"
          onNodeClick={handleNodeClick}
          onRefClick={(osis, label) => setPreview({ osis, label })}
        />
      ) : (
        <p className="muted" style={{ marginTop: 16 }}>暂无关系数据</p>
      )}

      {entity && backHref ? (
        <div className="entity-graph-foot">
          <Link href={backHref} className="font-pill">
            查看完整词条 ›
          </Link>
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
