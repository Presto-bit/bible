'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import {
  browseKnowledgeBases,
  type KnowledgeBaseBrowsePlatform,
} from '@/lib/api';

function formatUpdated(iso?: string | null): string {
  if (!iso) return '暂无更新';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '暂无更新';
    return `更新于 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '暂无更新';
  }
}

export default function KnowledgeBasesPage() {
  const [platform, setPlatform] = useState<KnowledgeBaseBrowsePlatform | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void browseKnowledgeBases()
      .then((data) => {
        if (!cancelled) setPlatform(data.platform);
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
      {loading && <p className="muted">加载中…</p>}
      {err && <p className="muted">{err}</p>}
      {platform && (
        <>
          <section className="card" style={{ padding: 16, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <strong style={{ fontSize: 17 }}>{platform.name}</strong>
              <span className="muted" style={{ fontSize: 11 }}>
                默认
              </span>
            </div>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55 }}>
              {platform.description}
            </p>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
              共 {platform.document_count} 份资料 · {platform.folders.length} 个文件夹
            </p>
            <Link
              href={`/assistant?kb=${encodeURIComponent(platform.id)}`}
              className="btn"
              style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}
            >
              用此库问小爱
            </Link>
          </section>

          <h2 style={{ fontSize: 15, margin: '20px 0 10px' }}>文件夹</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {platform.folders.map((f) => (
              <Link
                key={f.id}
                href={`/knowledge-bases/${f.id}`}
                className="card"
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: 14,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'var(--wash, #f5f0e8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'var(--accent-deep)',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M3 7.5h6l2 2.5H21v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-11z" />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>{f.name}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
                    {f.description}
                  </span>
                  <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
                    {f.document_count} 份 · {formatUpdated(f.updated_at)}
                  </span>
                </span>
                <span className="muted" style={{ flexShrink: 0 }}>
                  ›
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
