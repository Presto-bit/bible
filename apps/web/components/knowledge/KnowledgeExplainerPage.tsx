'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type KnowledgeLayout, type MapTour } from '@/lib/api';
import { recordMapTour } from '@/lib/badge_events';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';
import { readManuscriptPage } from '@/lib/manuscript_progress';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const openFromQuery = searchParams.get('view') === '1';
  const fromHome = searchParams.get('from') === 'home';
  const shouldAutoOpen = autoOpen || openFromQuery;
  const flowBack = useFlowBack(fromHome ? '/knowledge' : backHref);
  const goTopics = useCallback(() => {
    markRouteNavigation();
    router.replace('/knowledge');
  }, [router]);
  /** 首页探索进入：关手稿/返回 → 专题列表，不回首页 */
  const leave = fromHome ? goTopics : flowBack;
  const [viewerOpen, setViewerOpen] = useState(shouldAutoOpen);
  const [resumePage, setResumePage] = useState(0);

  const title = layout.title || tour.title;
  const guide = layout.guide_one_liner || tour.subtitle || '';
  const beats = layout.beats || [];
  const headerBackLabel = fromHome ? '知识专题' : backLabel;

  const pages = useMemo(
    () =>
      manuscriptFolioPages({
        tourId: tour.id,
        title,
        beatOrders: beats.map((b) => b.order),
      }),
    [tour.id, title, beats],
  );

  const coverSources = knowledgeRasterSources(
    pages[0]?.src ||
      `/knowledge/infographics/${encodeURIComponent(tour.id)}-comic.png`,
  );

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
      leave();
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
            <PageBackBar onClick={leave} label={headerBackLabel} />
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
              <picture>
                {coverSources.webp ? (
                  <source type="image/webp" srcSet={coverSources.webp} />
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="knowledge-cover-card-photo"
                  src={coverSources.fallback}
                  alt=""
                />
              </picture>
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
          onExitTopic={leave}
        />
      ) : null}
    </div>
  );
}
