'use client';

import { useEffect, useMemo, useState } from 'react';
import { type KnowledgeLayout, type MapTour } from '@/lib/api';
import { recordMapTour } from '@/lib/badge_events';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { clientWithBasePath } from '@/lib/basePath';
import { manuscriptFolioPages } from '@/components/knowledge/KnowledgeManuscriptFolio';
import { KnowledgeManuscriptViewer } from '@/components/knowledge/KnowledgeManuscriptViewer';

type Props = {
  tour: MapTour;
  layout: KnowledgeLayout;
  backHref?: string;
  backLabel?: string;
};

/** §19.14.17 专题封面卡 → 全屏手稿册查看 */
export function KnowledgeExplainerPage({
  tour,
  layout,
  backHref = '/search/map',
  backLabel = '地图故事',
}: Props) {
  const goBack = useFlowBack(backHref);
  const [viewerOpen, setViewerOpen] = useState(false);

  const title = layout.title || tour.title;
  const guide = layout.guide_one_liner || tour.subtitle || '';
  const beats = layout.beats || [];

  const pages = useMemo(
    () =>
      manuscriptFolioPages({
        tourId: tour.id,
        title,
        beatOrders: beats.map((b) => b.order),
      }),
    [tour.id, title, beats],
  );

  const coverSrc = pages[0]?.src
    ? clientWithBasePath(pages[0].src)
    : clientWithBasePath(`/knowledge/infographics/${encodeURIComponent(tour.id)}-comic.png`);

  useEffect(() => {
    recordMapTour(tour.id);
  }, [tour.id]);

  return (
    <div className="knowledge-explainer knowledge-explainer--cover">
      <header className="page-head story-mode-head">
        <PageBackBar onClick={goBack} label={backLabel} />
        <h2 className="page-head-title">{title}</h2>
      </header>

      <button
        type="button"
        className="knowledge-cover-card"
        onClick={() => setViewerOpen(true)}
        aria-label={`查看「${title}」手稿`}
      >
        <span className="knowledge-cover-card-media" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="knowledge-cover-card-photo" src={coverSrc} alt="" />
          <span className="knowledge-cover-card-veil" />
        </span>
        <span className="knowledge-cover-card-body">
          <span className="knowledge-cover-card-badge">彼爱手稿</span>
          <span className="knowledge-cover-card-title">{title}</span>
          {guide ? <span className="knowledge-cover-card-guide">{guide}</span> : null}
          <span className="knowledge-cover-card-cta">点击查看 · 共 {pages.length} 页</span>
        </span>
      </button>

      <p className="knowledge-explainer-disclaimer">释义说明，仅供参考</p>

      {viewerOpen ? (
        <KnowledgeManuscriptViewer
          pages={pages}
          title={title}
          onClose={() => setViewerOpen(false)}
          onExitTopic={goBack}
        />
      ) : null}
    </div>
  );
}
