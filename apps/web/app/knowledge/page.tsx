'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { api, type KnowledgeLayoutSummary } from '@/lib/api';
import { clientWithBasePath } from '@/lib/basePath';
import { mapStoryHref } from '@/lib/topic_routes';

function coverFor(row: KnowledgeLayoutSummary): string {
  if (row.cover_image) return clientWithBasePath(row.cover_image);
  const id = row.id || '';
  return clientWithBasePath(`/knowledge/infographics/${encodeURIComponent(id)}-comic.png`);
}

function hrefFor(row: KnowledgeLayoutSummary): string {
  const sourceId = row.source?.id || row.id;
  if (row.source?.kind === 'map_tour' || sourceId) {
    return mapStoryHref(sourceId);
  }
  return '/search';
}

/** 圣经知识专题列表：1 行 2 卡，按 generated_at 降序 */
export default function KnowledgeTopicsPage() {
  const goBack = useFlowBack('/');
  const [rows, setRows] = useState<KnowledgeLayoutSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .knowledgeLayouts()
      .then((d) => setRows(d.layouts ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ta = Date.parse(a.generated_at || '') || 0;
      const tb = Date.parse(b.generated_at || '') || 0;
      if (tb !== ta) return tb - ta;
      return (a.title || a.id || '').localeCompare(b.title || b.id || '', 'zh');
    });
  }, [rows]);

  return (
    <main className="container knowledge-topics-page">
      <header className="page-head">
        <PageBackBar onClick={goBack} label="首页" />
        <h2 className="page-head-title">圣经知识专题</h2>
      </header>
      <p className="muted knowledge-topics-lead">用手稿看懂经文结构 · 按更新时间排列</p>

      {loading ? <p className="muted">正在载入…</p> : null}
      {!loading && sorted.length === 0 ? (
        <p className="muted">暂无专题，稍后再来看看。</p>
      ) : null}

      <div className="knowledge-topics-grid">
        {sorted.map((row) => (
          <Link
            key={row.id}
            href={hrefFor(row)}
            className="knowledge-topic-card"
            aria-label={row.title || row.id}
          >
            <span className="knowledge-topic-card-media" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="knowledge-topic-card-photo"
                src={coverFor(row)}
                alt=""
                loading="lazy"
              />
              <span className="knowledge-topic-card-veil" />
            </span>
            <span className="knowledge-topic-card-body">
              <strong className="knowledge-topic-card-title">{row.title || row.id}</strong>
              {row.guide_one_liner ? (
                <span className="knowledge-topic-card-guide">{row.guide_one_liner}</span>
              ) : null}
              {row.beat_count ? (
                <span className="knowledge-topic-card-meta">{row.beat_count} 站</span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
