'use client';

import type { RefObject } from 'react';
import type { HomeGrowthCard, HomeGrowthModel } from '@/lib/home_growth_cards';
import type { HomeAnchorBlockModel } from '@/lib/home_anchor_block';
import { HomeAnchorBlock } from '@/components/home/HomeAnchorBlock';
import { HomeEndFooter } from '@/components/home/HomeEndFooter';
import { HomeMediaRow } from '@/components/home/HomeMediaRow';

type Props = {
  model: HomeGrowthModel;
  anchor: HomeAnchorBlockModel | null;
  onGo: (href: string) => void;
  reducedMotion?: boolean;
  endFooterRef?: RefObject<HTMLDivElement | null>;
  summaryFlash?: boolean;
  staggerEnter?: boolean;
};

function GrowthRow({
  card,
  onGo,
}: {
  card: HomeGrowthCard;
  onGo: (href: string) => void;
}) {
  const isSummary = card.kind === 'summary' || card.id.startsWith('summary');
  const hasMilestone = Boolean(card.sub);

  if (isSummary) {
    return (
      <div className="home-summary-card home-media-summary">
        <HomeMediaRow
          title={card.title}
          detail={card.detail}
          metric={card.metric}
          tone={card.mediaTone}
          icon={card.icon}
          imageUrl={card.imageUrl}
          progressPct={card.progressPct}
          ariaLabel={
            card.detail ? `${card.title}，${card.detail}` : card.title
          }
          className="home-media-summary-main"
          onClick={() => onGo(card.href)}
        />
        {hasMilestone ? (
          <button
            type="button"
            className="home-summary-sub"
            aria-label={card.sub}
            onClick={() => onGo(card.subHref || card.href)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="home-summary-sub-mark" aria-hidden />
            <span className="home-summary-sub-text">{card.sub}</span>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <HomeMediaRow
      title={card.title}
      detail={card.detail}
      eyebrow={card.tag}
      tone={card.mediaTone}
      icon={card.icon}
      imageUrl={card.imageUrl}
      ariaLabel={`${card.tag}：${card.title}`}
      className="home-growth-memory"
      onClick={() => onGo(card.href)}
    />
  );
}

/**
 * 折叠线下：摘要 A → 稳定落点 B → 记忆卡 C（可选）→ 到底 D
 */
export function HomeGrowthStack({
  model,
  anchor,
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
        model.memory ? 'has-memory' : '',
        staggerEnter ? 'home-stagger-enter' : '',
        summaryFlash ? 'is-summary-flash' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="阅读摘要与落点"
    >
      <div className={staggerEnter ? 'home-stagger-item home-stagger-3' : undefined}>
        <GrowthRow card={model.summary} onGo={onGo} />
      </div>
      {anchor ? <HomeAnchorBlock block={anchor} onGo={onGo} /> : null}
      {model.memory ? <GrowthRow card={model.memory} onGo={onGo} /> : null}
      <HomeEndFooter ref={endFooterRef} reducedMotion={reducedMotion} />
    </section>
  );
}
