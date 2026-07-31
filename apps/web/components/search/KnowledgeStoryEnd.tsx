'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  EXODUS_SERIES,
  knowledgeRelatedHref,
  seriesStepHref,
  type KnowledgeRelatedKind,
  type KnowledgeRelatedLink,
  clipShareBody,
} from '@/lib/knowledge_story';
import { shareKnowledgeTour } from '@/lib/knowledge_share';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

type Props = {
  title: string;
  related?: KnowledgeRelatedLink[] | null;
  /** 出埃及系列下一件；有则优先于「再走一遍」 */
  seriesNext?: KnowledgeRelatedLink | null;
  listHref: string;
  listLabel: string;
  onAsk: () => void;
  onRestart: () => void;
  restartLabel?: string;
  /** 分享出站卡 */
  share?: {
    kind: KnowledgeRelatedKind;
    id: string;
    /** 最后一站 note 或总结句 */
    highlight?: string | null;
    stopCount?: number;
    unit?: string;
  };
};

/** 知识导览走完一程：系列下一件优先 + 半屏问小爱 + 分享卡 + 相关线 */
export function KnowledgeStoryEnd({
  title,
  related,
  seriesNext,
  listHref,
  listLabel,
  onAsk,
  onRestart,
  restartLabel = '再走一遍',
  share,
}: Props) {
  const links = (related || []).filter((r) => r?.id && r?.kind);
  const relatedWithoutNext = seriesNext
    ? links.filter((r) => !(r.kind === seriesNext.kind && r.id === seriesNext.id))
    : links;
  const [shareBusy, setShareBusy] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);

  const onShare = async () => {
    if (!share || shareBusy) return;
    setShareBusy(true);
    setShareHint(null);
    try {
      const result = await shareKnowledgeTour({
        kind: share.kind,
        id: share.id,
        title,
        body: clipShareBody(share.highlight || ''),
        footer:
          share.stopCount && share.stopCount > 0
            ? `${share.stopCount} ${share.unit || '站'} · 彼爱`
            : undefined,
        badge: seriesNext ? '出埃及系列' : '圣经知识',
      });
      if (result === 'cancelled') return;
      if (result === 'failed') {
        setShareHint('分享未完成，可稍后重试');
        return;
      }
      setShareHint(result === 'copied' ? '已复制链接与摘要' : '已调起分享');
    } catch {
      setShareHint('分享未完成，可稍后重试');
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <div className="knowledge-story-end card card-2">
      <strong className="knowledge-story-end-title">「{title}」已走完</strong>
      <p className="muted knowledge-story-end-lead">
        {seriesNext
          ? `建议接着走「${seriesNext.label}」，把出埃及故事串完整。`
          : '可以分享这一程，或问小爱梳理脉络。'}
      </p>
      <div className="story-mode-actions knowledge-story-end-actions">
        {seriesNext ? (
          <Link
            href={knowledgeRelatedHref(seriesNext)}
            className="font-pill accent knowledge-story-end-pill-link"
            onClick={() => markRouteNavigation()}
          >
            下一站：{seriesNext.label} ›
          </Link>
        ) : null}
        <button
          type="button"
          className={seriesNext ? 'font-pill' : 'font-pill accent'}
          onClick={onAsk}
        >
          问小爱讲解
        </button>
        {share ? (
          <button
            type="button"
            className="font-pill"
            disabled={shareBusy}
            onClick={() => void onShare()}
          >
            {shareBusy ? '准备分享…' : '分享这程'}
          </button>
        ) : null}
        <button type="button" className="font-pill" onClick={onRestart}>
          {restartLabel}
        </button>
      </div>
      {shareHint ? (
        <p className="muted knowledge-story-share-hint" role="status">
          {shareHint}
        </p>
      ) : null}
      {relatedWithoutNext.length > 0 ? (
        <div className="knowledge-story-related">
          <p className="muted knowledge-story-related-label">相关知识</p>
          <ul className="knowledge-story-related-list">
            {relatedWithoutNext.map((link) => (
              <li key={`${link.kind}-${link.id}`}>
                <Link
                  href={knowledgeRelatedHref(link)}
                  className="text-link"
                  onClick={() => markRouteNavigation()}
                >
                  {link.label} ›
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="knowledge-story-end-foot">
        <Link
          href={listHref}
          className="text-link"
          onClick={() => markRouteNavigation()}
        >
          {listLabel}
        </Link>
        <Link
          href={seriesStepHref(EXODUS_SERIES.steps[0])}
          className="text-link"
          onClick={() => markRouteNavigation()}
        >
          出埃及系列 ›
        </Link>
      </div>
    </div>
  );
}
