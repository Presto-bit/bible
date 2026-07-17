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
  const [openFolder, setOpenFolder] = useState<string | null>(null);

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

  const folders = useMemo(() => {
    const list = data?.folders ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((f) => {
      if ((f.name || '').toLowerCase().includes(needle)) return true;
      if ((f.description || '').toLowerCase().includes(needle)) return true;
      return (f.documents || []).some((d) =>
        (d.title || '').toLowerCase().includes(needle),
      );
    });
  }, [data, q]);

  const useInAssistant = () => {
    router.push(`/assistant?kb=${encodeURIComponent(id)}`);
  };

  const isPlatform = data?.kind === 'platform';

  return (
    <main className="container" style={{ paddingBottom: 40 }}>
      <PageBackBar href="/knowledge-bases" label="知识库" />
      {err && <p className="muted">{err}</p>}
      {data && (
        <>
          <section style={{ marginTop: 12 }}>
            <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>{data.name}</h1>
            <p className="muted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.55 }}>
              {data.description}
            </p>
            <p className="muted" style={{ fontSize: 12 }}>
              {data.document_count} 份资料
              {data.updated_at ? ` · 更新于 ${formatUpdated(data.updated_at)}` : ''}
            </p>
            <button type="button" className="btn" style={{ marginTop: 10 }} onClick={useInAssistant}>
              用此库问小爱
            </button>
          </section>

          <div style={{ marginTop: 16 }}>
            <input
              type="search"
              className="input"
              placeholder={isPlatform ? '搜索文件夹…' : '搜索资料…'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {folders.map((f) => {
              const expandable = !isPlatform && (f.documents?.length ?? 0) > 0;
              const expanded = openFolder === f.id;
              return (
                <li key={f.id} style={{ marginBottom: 8 }}>
                  {isPlatform ? (
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
                      }}
                      onClick={() => router.push(`/knowledge-bases/${f.id}`)}
                    >
                      <strong style={{ fontSize: 14 }}>{f.name}</strong>
                      {f.description ? (
                        <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
                          {f.description}
                        </span>
                      ) : null}
                      <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 6 }}>
                        {f.document_count} 份 · 更新于 {formatUpdated(f.updated_at)}
                      </span>
                    </button>
                  ) : (
                    <div className="card" style={{ padding: '10px 12px' }}>
                      <button
                        type="button"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          cursor: expandable ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (!expandable) return;
                          setOpenFolder(expanded ? null : f.id);
                        }}
                      >
                        <strong style={{ fontSize: 14 }}>{f.name}</strong>
                        <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                          {f.document_count} 份
                          {f.updated_at ? ` · 更新于 ${formatUpdated(f.updated_at)}` : ''}
                          {expandable ? (expanded ? ' · 收起' : ' · 展开') : ''}
                        </span>
                      </button>
                      {expanded && f.documents ? (
                        <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0 }}>
                          {f.documents.map((d) => (
                            <li
                              key={d.id}
                              className="muted"
                              style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--line)' }}
                            >
                              {d.title}
                              {d.status && d.status !== 'ready' ? ` · ${d.status}` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
            {!folders.length && (
              <li className="muted" style={{ padding: 8 }}>
                {q.trim() ? '无匹配内容' : '暂无已入库资料'}
              </li>
            )}
          </ul>
        </>
      )}
      {!data && !err && <p className="muted">加载中…</p>}
    </main>
  );
}
