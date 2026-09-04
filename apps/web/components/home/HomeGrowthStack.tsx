'use client';

import type { RefObject } from 'react';
import type { HomeGrowthModel } from '@/lib/home_growth_cards';
import { homeGrowthObjectPositionForCard } from '@/lib/home_growth_tile_image';
import { HomeEndFooter } from '@/components/home/HomeEndFooter';
import { HomeMediaRow } from '@/components/home/HomeMediaRow';

type Props = {
  model: HomeGrowthModel;
  onGo: (href: string) => void;
  reducedMotion?: boolean;
  endFooterRef?: RefObject<HTMLDivElement | null>;
  summaryFlash?: boolean;
  staggerEnter?: boolean;
};

/**
 * 成长区功能卡列表（摘要 + 计划/主题/祷告等，最多 5 张）
 */
export function HomeGrowthStack({
  model,
  onGo,
  reducedMotion = false,
  endFooterRef,
  summaryFlash = false,
  staggerEnter = false,
}: Props) {
  return (
    <section
      className={[
        'home-stack',
        'home-growth-stack',
        staggerEnter ? 'home-stagger-enter' : '',
        summaryFlash ? 'is-summary-flash' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="阅读摘要与功能"
    >
      {model.cards.map((card, index) => {
        const isSummary = card.kind === 'summary' || card.id === 'summary';
        return (
          <div
            key={card.id}
            className={
              staggerEnter && index === 0
                ? 'home-stagger-item home-stagger-3'
                : undefined
            }
          >
            <HomeMediaRow
              title={card.title}
              detail={card.detail}
              metric={isSummary ? card.metric : undefined}
              eyebrow={isSummary ? undefined : card.tag}
              tone={card.mediaTone}
              icon={card.icon}
              imageUrl={card.imageUrl}
              imageObjectPosition={homeGrowthObjectPositionForCard(card.id)}
              progressPct={isSummary ? card.progressPct : undefined}
              ariaLabel={
                isSummary
                  ? card.detail
                    ? `${card.title}，${card.detail}`
                    : card.title
                  : `${card.tag}：${card.title}`
              }
              className={isSummary ? 'home-growth-summary' : 'home-growth-feature'}
              onClick={() => onGo(card.href)}
            />
          </div>
        );
      })}
      <HomeEndFooter ref={endFooterRef} reducedMotion={reducedMotion} />
    </section>
  );
}
