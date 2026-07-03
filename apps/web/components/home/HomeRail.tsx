'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { railDotClass, type HomeMoreItem, type RailCard } from '@/lib/home_rail';
import { coverForCardId } from '@/lib/card_covers';
import { RailCardCover } from '@/components/ui/RailCardCover';
import { StatRing } from '@/components/ui/StatRing';
import { HomeMoreSheet } from './HomeMoreSheet';

type Props = {
  cards: RailCard[];
  more: HomeMoreItem[];
};

function cardClass(c: RailCard, active: boolean): string {
  const parts = [
    'rail-card',
    'rail-card-has-cover',
    'card',
    `card-${c.kind}`,
    `card-tint-${c.tint}`,
    c.kind === 'action' ? 'card-3 card-tint card-accent rail-card-action' : 'card-2',
    active ? 'rail-card-active' : 'rail-card-inactive',
  ];
  if (c.kind === 'action') parts.push('rail-card-wide');
  return parts.filter(Boolean).join(' ');
}

export function HomeRail({ cards, more }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  const totalSlides = cards.length + (more.length > 0 ? 1 : 0);
  const moreCover = coverForCardId('more');

  useEffect(() => {
    const root = railRef.current;
    if (!root) return;

    const obs = new IntersectionObserver(
      (entries) => {
        let best = -1;
        let bestRatio = 0;
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.railIdx);
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            best = idx;
          }
        }
        if (best >= 0) setActiveIdx(best);
      },
      { root, threshold: [0.35, 0.55, 0.75] },
    );

    cardRefs.current.forEach((el) => {
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [cards.length, more.length]);

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const children = el.querySelectorAll<HTMLElement>('[data-rail-idx]');
    let best = 0;
    let bestDist = Infinity;
    const center = el.scrollLeft + el.clientWidth * 0.4;
    children.forEach((child) => {
      const idx = Number(child.dataset.railIdx);
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(childCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = idx;
      }
    });
    setActiveIdx(best);
  }, []);

  return (
    <>
      <div className="rail home-rail" ref={railRef} onScroll={onScroll}>
        {cards.map((c, i) => (
          <a
            key={c.id}
            ref={(el) => { cardRefs.current[i] = el; }}
            data-rail-idx={i}
            href={c.href}
            className={cardClass(c, activeIdx === i)}
            style={c.kind === 'action' && c.tint === 'gold' ? { ['--tint' as string]: 'var(--dawn-gold)' } : undefined}
          >
            <RailCardCover
              cover={c.cover}
              variant={c.kind === 'action' ? 'action' : 'default'}
              priority={i === 0}
            />
            {c.kind === 'stat' ? (
              <div className="rail-card-stat-row">
                <div className="rail-card-body">
                  <div className="rail-head">
                    <span className="pill pill-active">{c.tag}</span>
                    <span className="muted rail-reason">{c.reason}</span>
                  </div>
                  <div className="rail-title">{c.title}</div>
                  <div className="rail-foot">
                    <span className="rail-sub">{c.sub}</span>
                    <span className="rail-cta">{c.cta}</span>
                  </div>
                </div>
                {c.statPct != null && (
                  <StatRing pct={c.statPct} label={c.statLabel} size={48} className="rail-stat-ring" />
                )}
              </div>
            ) : (
              <div className="rail-card-body">
                <div className="rail-head">
                  <span className={`pill ${c.kind === 'action' ? 'pill-active' : ''}`}>
                    {c.tag}
                  </span>
                  <span className="muted rail-reason">{c.reason}</span>
                </div>
                <div className="rail-title">{c.title}</div>
                {c.kind === 'action' && c.progressPct != null && c.progressPct > 0 && (
                  <div className="progress-bar rail-action-progress">
                    <div className="progress-fill plan-fill" style={{ width: `${c.progressPct}%` }} />
                  </div>
                )}
                <div className="rail-foot">
                  <span className="rail-sub">{c.sub}</span>
                  <span className="rail-cta">{c.cta}</span>
                </div>
              </div>
            )}
          </a>
        ))}
        {more.length > 0 && (
          <button
            type="button"
            ref={(el) => { cardRefs.current[cards.length] = el; }}
            data-rail-idx={cards.length}
            className={`rail-card rail-card-has-cover card card-ghost card-2 card-tint-slate rail-card-more${activeIdx === cards.length ? ' rail-card-active' : ' rail-card-inactive'}`}
            onClick={() => setMoreOpen(true)}
          >
            <RailCardCover cover={moreCover} variant="default" />
            <div className="rail-card-body">
              <div className="rail-head">
                <span className="pill">更多</span>
                <span className="muted rail-reason">{more.length} 个入口</span>
              </div>
              <div className="rail-title">探索更多功能</div>
              <div className="rail-foot">
                <span className="rail-sub">问答 · 小爱 · 计划</span>
                <span className="rail-cta">打开 ›</span>
              </div>
            </div>
          </button>
        )}
      </div>
      <div className="dots home-rail-dots">
        {Array.from({ length: totalSlides }, (_, i) => {
          const isMore = i >= cards.length;
          const c = cards[i];
          const cls = isMore
            ? railDotClass('more')
            : c
              ? railDotClass(c.kind, c.tint)
              : 'dot-slate';
          return (
            <span
              key={i}
              className={`dot ${cls}${i === activeIdx ? ' dot-active' : ''}`}
            />
          );
        })}
      </div>
      <HomeMoreSheet open={moreOpen} items={more} onClose={() => setMoreOpen(false)} />
    </>
  );
}
