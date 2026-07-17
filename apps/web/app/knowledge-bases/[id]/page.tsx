'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { getKnowledgeBase, type KnowledgeBaseDetail } from '@/lib/api';

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

  const docs = useMemo(() => {
    if (!data?.documents) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.documents;
    return data.documents.filter(
      (d) =>
        (d.title || '').toLowerCase().includes(needle) ||
        (d.source_type || '').toLowerCase().includes(needle),
    );
  }, [data, q]);

  const useInAssistant = () => {
    router.push(`/assistant?kb=${encodeURIComponent(id)}`);
  };

  return (
    <main className="container" style={{ paddingBottom: 40 }}>
      <PageBackBar href="/knowledge-bases" label="知识库" />
      {err && <p className="muted">{err}</p>}
      {data && (
        <>
          <h1 style={{ fontSize: 22, margin: '12px 0 8px' }}>{data.name}</h1>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            {data.description}
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            资料 {data.document_count} 份
          </p>
          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={useInAssistant}>
            用此库问小爱
          </button>
          <div style={{ marginTop: 16 }}>
            <input
              type="search"
              className="input"
              placeholder="搜索资料标题…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
            {docs.map((d) => (
              <li
                key={d.id}
                className="card"
                style={{ padding: '10px 12px', marginBottom: 8 }}
              >
                <strong style={{ fontSize: 14 }}>{d.title || '未命名资料'}</strong>
                <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                  {d.source_type}
                  {d.status && d.status !== 'ready' ? ` · ${d.status}` : ''}
                </span>
              </li>
            ))}
            {!docs.length && (
              <li className="muted" style={{ padding: 8 }}>
                {q.trim() ? '无匹配资料' : '暂无已入库资料'}
              </li>
            )}
          </ul>
        </>
      )}
      {!data && !err && <p className="muted">加载中…</p>}
    </main>
  );
}
