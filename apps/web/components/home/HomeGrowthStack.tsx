'use client';

import type { HomeGrowthCard, HomeGrowthModel } from '@/lib/home_growth_cards';

type Props = {
  model: HomeGrowthModel;
  onGo: (href: string) => void;
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

/** 一行摘要 + 可选一张记忆卡；无「成长与回忆」分区标题。 */
export function HomeGrowthStack({ model, onGo }: Props) {
  return (
    <section className="home-stack home-growth-stack" aria-label="阅读摘要与回忆">
      <GrowthRow card={model.summary} onGo={onGo} />
      {model.memory ? <GrowthRow card={model.memory} onGo={onGo} /> : null}
    </section>
  );
}
