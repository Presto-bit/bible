'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import type { KnowledgeLayoutSummary } from '@/lib/api';
import { clientWithBasePath } from '@/lib/basePath';
import { mapStoryHref } from '@/lib/topic_routes';

function coverFor(row: KnowledgeLayoutSummary): string {
  if (row.cover_image) return clientWithBasePath(row.cover_image);
  const id = row.id || '';
  if (id === 'exodus-wilderness') {
    return clientWithBasePath('/knowledge/vignettes/wilderness/00_overview.png');
  }
  if (id === 'paul-first-journey') {
    return clientWithBasePath('/knowledge/infographics/paul-first-journey-comic.png');
  }
  return clientWithBasePath('/knowledge/infographics/_paper_texture.jpg');
}

function hrefFor(row: KnowledgeLayoutSummary): string {
  const sourceId = row.source?.id || row.id;
  return mapStoryHref(sourceId);
}

type Props = {
  initialLayouts: KnowledgeLayoutSummary[];
};

export function KnowledgeTopicsClient({ initialLayouts }: Props) {
  const goBack = useFlowBack('/');
  const rows = initialLayouts;

  return (
    <main className="container knowledge-topics-page">
      <header className="page-head">
        <PageBackBar onClick={goBack} label="首页" />
        <h2 className="page-head-title">圣经知识专题</h2>
      </header>
      <p className="muted knowledge-topics-lead">用手稿看懂经文结构 · 按更新时间排列</p>

      {rows.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          暂无专题，稍后再来看看。
        </p>
      ) : (
        <div className="knowledge-topics-grid">
          {rows.map((row) => (
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
      )}
    </main>
  );
}
