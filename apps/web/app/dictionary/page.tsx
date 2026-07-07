'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type DictEntity } from '@/lib/api';
import {
  entityDisplayName,
  entitySummaryText,
  entityTypeLabel,
} from '@/lib/dictionary_match';
import { entityDictionaryHref } from '@/lib/entity_knowledge';

function DictionaryListContent() {
  useEdgeSwipeBack({ href: '/profile?settings=1' });
  const searchParams = useSearchParams();
  const qParam = searchParams.get('q')?.trim() ?? '';

  const [term, setTerm] = useState(qParam);
  const [entities, setEntities] = useState<DictEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTerm(qParam);
  }, [qParam]);

  useEffect(() => {
    api
      .dictionary()
      .then((d) => setEntities(d.entities || []))
      .catch(() => setEntities([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.id ?? '').toLowerCase().includes(q) ||
        (e.disambiguation ?? '').toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q),
    );
  }, [entities, term]);

  const exactMatch = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return null;
    return entities.find(
      (e) =>
        e.name.toLowerCase() === q ||
        (e.id ?? '').toLowerCase() === q,
    ) ?? null;
  }, [entities, term]);

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/profile?settings=1" label="设置" />
        <h2 className="page-head-title">圣经词典</h2>
        <span className="muted" style={{ fontSize: 12 }}>{loading ? '' : `${entities.length} 条`}</span>
      </header>
      <div className="search-bar" style={{ marginTop: 12 }}>
        <input
          className="search-input"
          placeholder="搜索专名、地名…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {exactMatch ? (
        <Link
          href={entityDictionaryHref(exactMatch)}
          className="card card-2"
          style={{ display: 'block', marginTop: 12, padding: 12 }}
        >
          打开词条：{entityDisplayName(exactMatch)} ›
        </Link>
      ) : null}

      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>加载中…</p>
      ) : filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>未找到匹配词条</p>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((e) => (
            <Link
              key={e.id ?? e.name}
              href={entityDictionaryHref(e)}
              className="card card-2"
              style={{ padding: 12, display: 'block' }}
            >
              <strong>{entityDisplayName(e)}</strong>
              {entityTypeLabel(e.type) ? (
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                  {entityTypeLabel(e.type)}
                </span>
              ) : null}
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6 }}>
                {entitySummaryText(e)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

export default function DictionaryPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <DictionaryListContent />
    </Suspense>
  );
}
