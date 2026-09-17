'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { type KnowledgeLayout, type MapTour } from '@/lib/api';
import { recordMapTour } from '@/lib/badge_events';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { knowledgeMediaUrl } from '@/lib/knowledge_media_url';
import { readManuscriptPage } from '@/lib/manuscript_progress';
import { manuscriptFolioPages } from '@/components/knowledge/KnowledgeManuscriptFolio';
import { KnowledgeManuscriptViewer } from '@/components/knowledge/KnowledgeManuscriptViewer';

type Props = {
  tour: MapTour;
  layout: KnowledgeLayout;
  backHref?: string;
  backLabel?: string;
  /** 进入即全屏（探索列表 ?view=1） */
  autoOpen?: boolean;
};

/** §19.14.17 专题手稿：可直达全屏 */
export function KnowledgeExplainerPage({
  tour,
  layout,
  backHref = '/search/map',
  backLabel = '地图故事',
  autoOpen = false,
}: Props) {
  const searchParams = useSearchParams();
  const openFromQuery = searchParams.get('view') === '1';
  const shouldAutoOpen = autoOpen || openFromQuery;
  const goBack = useFlowBack(backHref);
  const [viewerOpen, setViewerOpen] = useState(shouldAutoOpen);
  const [resumePage, setResumePage] = useState(0);

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
    ? knowledgeMediaUrl(pages[0].src)
    : knowledgeMediaUrl(`/knowledge/infographics/${encodeURIComponent(tour.id)}-comic.png`);

  useEffect(() => {
    recordMapTour(tour.id);
  }, [tour.id]);

  useEffect(() => {
    setResumePage(readManuscriptPage(tour.id, pages.length));
  }, [tour.id, pages.length]);

  useEffect(() => {
    if (shouldAutoOpen) setViewerOpen(true);
  }, [shouldAutoOpen, tour.id]);

  const closeViewer = () => {
    setResumePage(readManuscriptPage(tour.id, pages.length));
    if (shouldAutoOpen) {
      goBack();
      return;
    }
    setViewerOpen(false);
  };

  const resumeHint =
    resumePage > 0 && pages.length > 1
      ? `续读第 ${resumePage + 1} 页 · 共 ${pages.length} 页`
      : `共 ${pages.length} 页 · 左右滑动`;

  return (
    <div className="knowledge-explainer knowledge-explainer--cover">
      {!viewerOpen ? (
        <>
          <header className="page-head story-mode-head">
            <PageBackBar onClick={goBack} label={backLabel} />
            <h2 className="page-head-title">{title}</h2>
          </header>

          <button
            type="button"
            className="knowledge-cover-card"
            onClick={() => setViewerOpen(true)}
            aria-label={
              resumePage > 0
                ? `续读「${title}」手稿，第 ${resumePage + 1} 页`
                : `查看「${title}」手稿`
            }
          >
            <span className="knowledge-cover-card-media" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="knowledge-cover-card-photo" src={coverSrc} alt="" />
              <span className="knowledge-cover-card-veil" />
              <span className="knowledge-cover-card-play">
                {resumePage > 0 ? '继续阅读' : '打开手稿'}
              </span>
            </span>
            <span className="knowledge-cover-card-body">
              <span className="knowledge-cover-card-badge">彼爱手稿</span>
              <span className="knowledge-cover-card-title">{title}</span>
              {guide ? <span className="knowledge-cover-card-guide">{guide}</span> : null}
              <span className="knowledge-cover-card-cta">{resumeHint}</span>
            </span>
          </button>

          <p className="knowledge-explainer-disclaimer">释义说明，仅供参考</p>
        </>
      ) : null}

      {viewerOpen ? (
        <KnowledgeManuscriptViewer
          pages={pages}
          title={title}
          tourId={tour.id}
          onClose={closeViewer}
          onExitTopic={goBack}
        />
      ) : null}
    </div>
  );
}
