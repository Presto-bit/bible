'use client';

import type { HomeGrowthCard, HomeGrowthModel } from '@/lib/home_growth_cards';
import type { HomeAnchorBlockModel } from '@/lib/home_anchor_block';
import { HomeAnchorBlock } from '@/components/home/HomeAnchorBlock';
import { HomeEndFooter } from '@/components/home/HomeEndFooter';

type Props = {
  model: HomeGrowthModel;
  anchor: HomeAnchorBlockModel | null;
  onGo: (href: string) => void;
  bottomStretch?: number;
  reducedMotion?: boolean;
};

function GrowthRow({
  card,
  onGo,
}: {
  card: HomeGrowthCard;
  onGo: (href: string) => void;
}) {
  const isSummary = card.kind === 'summary' || card.id.startsWith('summary');
  const singleLine = !card.sub;

  return (
    <button
      type="button"
      className={[
        'card',
        'row-card',
        'home-list-row',
        isSummary ? 'home-reading-summary' : 'home-growth-memory',
        singleLine ? 'home-growth-row-single' : 'home-list-row-wrap',
        card.accent ? 'card-2 card-tint card-accent' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={isSummary ? card.title : `${card.tag}：${card.title}`}
      onClick={() => onGo(card.href)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!isSummary ? (
        <span className={`pill${card.pillActive ? ' pill-active' : ''}`}>{card.tag}</span>
      ) : null}
      <span className="home-list-main">
        <strong>{card.title}</strong>
        {card.sub ? <span className="muted home-list-sub">{card.sub}</span> : null}
      </span>
      <span className="muted home-list-chevron">›</span>
    </button>
  );
}

/**
 * 折叠线下：摘要 A → 稳定落点 B → 记忆卡 C（可选）→ 到底 D
 */
export function HomeGrowthStack({
  model,
  anchor,
  onGo,
  bottomStretch = 0,
  reducedMotion = false,
}: Props) {
  return (
    <section className="home-stack home-growth-stack" aria-label="阅读摘要与落点">
      <GrowthRow card={model.summary} onGo={onGo} />
      {anchor ? <HomeAnchorBlock block={anchor} onGo={onGo} /> : null}
      {model.memory ? <GrowthRow card={model.memory} onGo={onGo} /> : null}
      <HomeEndFooter stretchPx={bottomStretch} reducedMotion={reducedMotion} />
    </section>
  );
}
