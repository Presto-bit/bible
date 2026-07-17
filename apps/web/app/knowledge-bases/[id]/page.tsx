'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { getKnowledgeBase, type KnowledgeBaseDetail } from '@/lib/api';

function formatUpdated(iso?: string | null): string {
  if (!iso) return '暂无更新';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '暂无更新';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '暂无更新';
  }
}

export default function KnowledgeBaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');
  const [data, setData] = useState<KnowledgeBaseDetail | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void getKnowledgeBase(id)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : '加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isPlatform = data?.kind === 'platform';

  const folders = useMemo(() => {
    if (!isPlatform) return [];
    const list = data?.folders ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (f) =>
        (f.name || '').toLowerCase().includes(needle) ||
        (f.description || '').toLowerCase().includes(needle),
    );
  }, [data, q, isPlatform]);

  const files = useMemo(() => {
    if (isPlatform) return [];
    const list = data?.documents ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (d) =>
        (d.title || '').toLowerCase().includes(needle) ||
        (d.source_type || '').toLowerCase().includes(needle),
    );
  }, [data, q, isPlatform]);

  const backHref = isPlatform ? '/knowledge-bases' : '/knowledge-bases/platform';
  const backLabel = isPlatform ? '知识库' : '平台知识库';

  return (
    <main className="container" style={{ paddingBottom: 40 }}>
      <PageBackBar href={backHref} label={backLabel} />
      {err && <p className="muted">{err}</p>}
      {data && (
        <>
          <section style={{ marginTop: 12 }}>
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>{data.name}</h1>
            <p className="muted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.55 }}>
              {data.description}
            </p>
            <p className="muted" style={{ fontSize: 12 }}>
              {isPlatform
                ? `${data.folders?.length ?? 0} 个文件夹 · ${data.document_count} 份资料`
                : `${data.document_count} 份资料`}
              {data.updated_at ? ` · 更新于 ${formatUpdated(data.updated_at)}` : ''}
            </p>
            {isPlatform && (
              <button
                type="button"
                className="btn"
                style={{ marginTop: 10 }}
                onClick={() => router.push('/assistant?kb=platform')}
              >
                用此库问小爱
              </button>
            )}
          </section>

          <div style={{ marginTop: 16 }}>
            <input
              type="search"
              className="input"
              placeholder={isPlatform ? '搜索文件夹…' : '搜索文件…'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          {isPlatform ? (
            <>
              <h2 style={{ fontSize: 15, margin: '18px 0 10px' }}>文件夹</h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {folders.map((f) => (
                  <li key={f.id} style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      className="card"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        border: 'none',
                        background: 'var(--surface)',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start',
                      }}
                      onClick={() => router.push(`/knowledge-bases/${f.id}`)}
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
                        <strong style={{ fontSize: 14 }}>{f.name}</strong>
                        {f.description ? (
                          <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
                            {f.description}
                          </span>
                        ) : null}
                        <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
                          {f.document_count} 份 · 更新于 {formatUpdated(f.updated_at)}
                        </span>
                      </span>
                      <span className="muted">›</span>
                    </button>
                  </li>
                ))}
                {!folders.length && (
                  <li className="muted" style={{ padding: 8 }}>
                    {q.trim() ? '无匹配文件夹' : '暂无文件夹'}
                  </li>
                )}
              </ul>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 15, margin: '18px 0 10px' }}>文件</h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {files.map((d) => (
                  <li
                    key={d.id}
                    className="card"
                    style={{ padding: '10px 12px', marginBottom: 8 }}
                  >
                    <strong style={{ fontSize: 14 }}>{d.title || '未命名资料'}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                      {d.source_type}
                      {d.status && d.status !== 'ready' ? ` · ${d.status}` : ''}
                      {d.created_at ? ` · ${formatUpdated(d.created_at)}` : ''}
                    </span>
                  </li>
                ))}
                {!files.length && (
                  <li className="muted" style={{ padding: 8 }}>
                    {q.trim() ? '无匹配文件' : '暂无已入库文件'}
                  </li>
                )}
              </ul>
            </>
          )}
        </>
      )}
      {!data && !err && <p className="muted">加载中…</p>}
    </main>
  );
}
