'use client';

import type { HomeGrowthCard } from '@/lib/home_growth_cards';

type Props = {
  cards: HomeGrowthCard[];
  onGo: (href: string) => void;
};

export function HomeGrowthStack({ cards, onGo }: Props) {
  if (!cards.length) return null;

  return (
    <div className="home-stack home-growth-stack">
      {cards.map((c) => {
        const singleLine = !c.sub;
        return (
        <button
          key={c.id}
          type="button"
          className={[
            'card',
            'row-card',
            'home-list-row',
            singleLine ? 'home-growth-row-single' : 'home-list-row-wrap',
            c.accent ? 'card-2 card-tint card-accent' : '',
            c.id === 'today' ? 'home-reading-summary' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onGo(c.href)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className={`pill${c.pillActive ? ' pill-active' : ''}`}>{c.tag}</span>
          <span className="home-list-main">
            <strong>{c.title}</strong>
            {c.sub ? (
              <span className="muted home-list-sub">{c.sub}</span>
            ) : null}
          </span>
          <span className="muted home-list-chevron">›</span>
        </button>
        );
      })}
    </div>
  );
}
