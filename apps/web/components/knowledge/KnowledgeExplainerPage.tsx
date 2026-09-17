'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type KnowledgeLayout, type MapTour } from '@/lib/api';
import { recordMapTour } from '@/lib/badge_events';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import {
  markKnowledgeSoftReturn,
  startKnowledgeExpand,
} from '@/lib/knowledge_nav';
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
    markKnowledgeSoftReturn();
    markRouteNavigation();
    router.replace('/knowledge');
  }, [router]);
  /** 首页探索进入：关手稿/返回 → 专题列表，不回首页 */
  const leave = useCallback(() => {
    markKnowledgeSoftReturn();
    flowBack();
  }, [flowBack]);
  const leaveFromViewer = shouldAutoOpen || fromHome ? goTopics : leave;
  const [viewerOpen, setViewerOpen] = useState(shouldAutoOpen);

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

  const coverPath =
    pages[0]?.src ||
    `/knowledge/infographics/${encodeURIComponent(tour.id)}-comic.png`;
  const coverSources = knowledgeRasterSources(coverPath);

  useEffect(() => {
    recordMapTour(tour.id);
  }, [tour.id]);

  useEffect(() => {
    if (shouldAutoOpen) setViewerOpen(true);
  }, [shouldAutoOpen, tour.id]);

  const closeViewer = () => {
    if (shouldAutoOpen) {
      leaveFromViewer();
      return;
    }
    setViewerOpen(false);
  };

  return (
    <div className="knowledge-explainer knowledge-explainer--cover">
      {!viewerOpen ? (
        <>
          <header className="page-head story-mode-head">
            <PageBackBar onClick={leaveFromViewer} label={headerBackLabel} />
            <h2 className="page-head-title">{title}</h2>
          </header>

          <button
            type="button"
            className="knowledge-cover-card"
            onClick={(e) => {
              startKnowledgeExpand({
                el: e.currentTarget,
                cover: coverPath,
                topicId: tour.id,
              });
              setViewerOpen(true);
            }}
            aria-label={`查看「${title}」手稿`}
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
                打开手稿
              </span>
            </span>
            <span className="knowledge-cover-card-body">
              <span className="knowledge-cover-card-badge">彼爱手稿</span>
              <span className="knowledge-cover-card-title">{title}</span>
              {guide ? <span className="knowledge-cover-card-guide">{guide}</span> : null}
              <span className="knowledge-cover-card-cta">
                共 {pages.length} 页 · 左右滑动
              </span>
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
          onExitTopic={leaveFromViewer}
        />
      ) : null}
    </div>
  );
}
