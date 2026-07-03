'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { railDotClass, type RailCard } from '@/lib/home_rail';
import { StatRing } from '@/components/ui/StatRing';

type Props = {
  cards: RailCard[];
};

function cardClass(c: RailCard, active: boolean): string {
  const parts = [
    'rail-card',
    'card',
    `card-${c.kind}`,
    `card-tint-${c.tint}`,
    c.kind === 'action' ? 'card-3 card-tint card-accent rail-card-action' : 'card-2',
    active ? 'rail-card-active' : 'rail-card-inactive',
  ];
  if (c.kind === 'action') parts.push('rail-card-wide');
  return parts.filter(Boolean).join(' ');
}

export function HomeRail({ cards }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

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
  }, [cards.length]);

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
            {c.kind === 'media' && (
              <span className="card-media-icon" aria-hidden>{c.icon}</span>
            )}
            <div className="rail-card-body">
              <div className="rail-head">
                <span className={`pill ${c.kind === 'action' || c.kind === 'stat' ? 'pill-active' : ''}`}>
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
              </div>
            </div>
            {c.kind === 'stat' && c.statPct != null && (
              <StatRing pct={c.statPct} label={c.statLabel} size={48} className="rail-stat-ring" />
            )}
          </a>
        ))}
      </div>
      <div className="dots home-rail-dots">
        {cards.map((c, i) => (
          <span
            key={c.id}
            className={`dot ${railDotClass(c.kind, c.tint)}${i === activeIdx ? ' dot-active' : ''}`}
          />
        ))}
      </div>
    </>
  );
}
