'use client';

import { useEffect, useMemo, useState } from 'react';
import { type KnowledgeLayout, type MapTour } from '@/lib/api';
import { recordMapTour } from '@/lib/badge_events';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { clientWithBasePath } from '@/lib/basePath';
import {
  KnowledgeManuscriptFolio,
  manuscriptFolioPages,
} from '@/components/knowledge/KnowledgeManuscriptFolio';

type Props = {
  tour: MapTour;
  layout: KnowledgeLayout;
  backHref?: string;
  backLabel?: string;
};

/** §19.14.17 手稿册专题页：总手稿 + 站手稿横滑；页面简洁 */
export function KnowledgeExplainerPage({
  tour,
  layout,
  backHref = '/search/map',
  backLabel = '地图故事',
}: Props) {
  const goBack = useFlowBack(backHref);
  const [pageIndex, setPageIndex] = useState(0);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);

  const title = layout.title || tour.title;
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

  const current = pages[pageIndex] || pages[0];

  useEffect(() => {
    recordMapTour(tour.id);
  }, [tour.id]);

  const onSave = async () => {
    if (shareBusy || !current) return;
    setShareBusy(true);
    setShareHint(null);
    try {
      const res = await fetch(clientWithBasePath(current.src));
      if (!res.ok) throw new Error('missing');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = current.src.split('/').pop() || `${tour.id}-manuscript.png`;
      a.click();
      URL.revokeObjectURL(url);
      setShareHint('已保存手稿');
    } catch {
      setShareHint('保存失败，可稍后重试');
    } finally {
      setShareBusy(false);
    }
  };

  const onShare = async () => {
    if (shareBusy || !current) return;
    setShareBusy(true);
    setShareHint(null);
    try {
      const res = await fetch(clientWithBasePath(current.src));
      if (!res.ok) throw new Error('missing');
      const blob = await res.blob();
      const file = new File([blob], current.src.split('/').pop() || 'manuscript.png', {
        type: 'image/png',
      });
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        setShareHint('已调起分享');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text: title, url: window.location.href });
        setShareHint('已调起分享');
        return;
      }
      await onSave();
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setShareHint('分享未完成，可稍后重试');
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <div className="knowledge-explainer knowledge-explainer--folio">
      <header className="page-head story-mode-head">
        <PageBackBar onClick={goBack} label={backLabel} />
        <h2 className="page-head-title">{title}</h2>
      </header>

      <KnowledgeManuscriptFolio pages={pages} onIndexChange={setPageIndex} />

      <div className="knowledge-explainer-footer">
        <button
          type="button"
          className="font-pill accent"
          disabled={shareBusy}
          onClick={() => void onShare()}
        >
          {shareBusy ? '准备中…' : '分享本页'}
        </button>
        <button
          type="button"
          className="font-pill"
          disabled={shareBusy}
          onClick={() => void onSave()}
        >
          保存本页
        </button>
      </div>
      {shareHint ? (
        <p className="muted knowledge-story-share-hint" role="status">
          {shareHint}
        </p>
      ) : null}

      <p className="knowledge-explainer-disclaimer">释义说明，仅供参考 · 左右滑动翻页</p>
    </div>
  );
}
