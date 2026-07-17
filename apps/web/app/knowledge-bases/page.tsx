'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import {
  browseKnowledgeBases,
  type KnowledgeBaseBrowsePlatform,
} from '@/lib/api';

/** 知识库入口：仅展示平台知识库，点入主页看文件夹 */
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
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        浏览平台资料；小爱默认使用平台知识库检索。
      </p>
      {loading && <p className="muted">加载中…</p>}
      {err && <p className="muted">{err}</p>}
      {platform && (
        <Link
          href="/knowledge-bases/platform"
          className="card"
          style={{
            display: 'block',
            padding: 16,
            marginTop: 16,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
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
            {platform.folders.length} 个文件夹 · 共 {platform.document_count} 份资料
          </p>
          <span className="text-link" style={{ display: 'inline-block', marginTop: 10, fontSize: 13 }}>
            进入主页 ›
          </span>
        </Link>
      )}
    </main>
  );
}
