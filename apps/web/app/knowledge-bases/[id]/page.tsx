'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { KnowledgeDocPreviewSheet } from '@/components/knowledge/KnowledgeDocPreviewSheet';
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

function KnowledgeBaseDetailInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = String(params?.id || '');
  const group = searchParams.get('group');
  const [data, setData] = useState<KnowledgeBaseDetail | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setData(null);
    setErr('');
    void getKnowledgeBase(id, { group })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : '加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [id, group]);

  const isPlatform = data?.kind === 'platform';
  const showFolders = Boolean(
    isPlatform || data?.has_subfolders || ((data?.folders?.length ?? 0) > 0 && !(data?.documents?.length)),
  );

  const folders = useMemo(() => {
    if (!showFolders) return [];
    const list = data?.folders ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (f) =>
        (f.name || '').toLowerCase().includes(needle) ||
        (f.description || '').toLowerCase().includes(needle),
    );
  }, [data, q, showFolders]);

  const files = useMemo(() => {
    if (showFolders) return [];
    const list = data?.documents ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (d) =>
        (d.title || '').toLowerCase().includes(needle) ||
        (d.source_type || '').toLowerCase().includes(needle),
    );
  }, [data, q, showFolders]);

  const backHref = (() => {
    if (isPlatform) return '/knowledge-bases';
    if (group) return `/knowledge-bases/${id}`;
    return '/knowledge-bases/platform';
  })();
  const backLabel = (() => {
    if (isPlatform) return '知识库';
    if (group) return '公版英文注释';
    return '平台知识库';
  })();

  const onFolderClick = (folderId: string) => {
    if (isPlatform) {
      router.push(`/knowledge-bases/${folderId}`);
      return;
    }
    router.push(`/knowledge-bases/${id}?group=${encodeURIComponent(folderId)}`);
  };

  return (
    <main className="container" style={{ paddingBottom: 40 }}>
      <PageBackBar href={backHref} label={backLabel} />
      {err && <p className="muted">{err}</p>}
      {data && (
        <>
          <section style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <h1 style={{ fontSize: 22, margin: '0 0 8px', flex: 1 }}>{data.name}</h1>
              <button
                type="button"
                aria-label={searchOpen ? '关闭搜索' : '搜索'}
                title="搜索"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  if (searchOpen) setQ('');
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: 'none',
                  background: searchOpen ? 'var(--accent-wash, #f3ead2)' : 'transparent',
                  color: searchOpen ? 'var(--accent-deep)' : 'var(--ink-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16.5 16.5L21 21" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="muted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.55 }}>
              {data.description}
            </p>
            <p className="muted" style={{ fontSize: 12 }}>
              {showFolders
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

          {searchOpen && (
            <div style={{ marginTop: 12 }}>
              <input
                type="search"
                className="input"
                autoFocus
                placeholder={showFolders ? '搜索文件夹…' : '搜索文件…'}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {showFolders ? (
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
                      onClick={() => onFolderClick(f.id)}
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
                  <li key={d.id} style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      className="card"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: 'none',
                        background: 'var(--surface)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setPreviewId(d.id)}
                    >
                      <strong style={{ fontSize: 14 }}>{d.title || '未命名资料'}</strong>
                      <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                        {d.source_type}
                        {d.status && d.status !== 'ready' ? ` · ${d.status}` : ''}
                        {d.created_at ? ` · ${formatUpdated(d.created_at)}` : ''}
                        {' · 预览'}
                      </span>
                    </button>
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
      {previewId && (
        <KnowledgeDocPreviewSheet
          documentId={previewId}
          onClose={() => setPreviewId(null)}
        />
      )}
    </main>
  );
}

export default function KnowledgeBaseDetailPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <KnowledgeBaseDetailInner />
    </Suspense>
  );
}
