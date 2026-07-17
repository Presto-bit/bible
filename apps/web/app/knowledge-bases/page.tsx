'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import {
  listKnowledgeBases,
  type KnowledgeBaseSummary,
} from '@/lib/api';

export default function KnowledgeBasesPage() {
  const [items, setItems] = useState<KnowledgeBaseSummary[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listKnowledgeBases()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="container" style={{ paddingBottom: 40 }}>
      <PageBackBar href="/profile?settings=1" label="我的" />
      <h1 style={{ fontSize: 22, margin: '12px 0 8px' }}>知识库</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        浏览平台与专题资料库；在小爱对话中可单选其一作为检索范围。
      </p>
      {loading && <p className="muted">加载中…</p>}
      {err && <p className="muted">{err}</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {items.map((kb) => (
          <Link
            key={kb.id}
            href={`/knowledge-bases/${kb.id}`}
            className="card"
            style={{ display: 'block', padding: 14, textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <strong>{kb.name}</strong>
              {kb.is_default ? (
                <span className="muted" style={{ fontSize: 11 }}>
                  默认
                </span>
              ) : null}
            </div>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
              {kb.description}
            </p>
            <span className="text-link" style={{ fontSize: 12, marginTop: 8, display: 'inline-block' }}>
              查看资料 ›
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
