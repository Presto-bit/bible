'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { railDotClass, railShowsProgress, type RailCard } from '@/lib/home_rail';
import { RailLineIcon } from '@/components/home/RailLineIcon';

type Props = {
  cards: RailCard[];
};

function cardClass(c: RailCard, active: boolean): string {
  const parts = [
    'rail-card',
    'rail-card-row',
    'card',
    `card-${c.kind}`,
    `card-tint-${c.tint}`,
    c.kind === 'action' ? 'card-3 card-tint card-accent rail-card-action' : 'card-2',
    active ? 'rail-card-active' : 'rail-card-inactive',
  ];
  return parts.filter(Boolean).join(' ');
}

/** 圆形图标：线性 SVG；统计卡显示百分比文字 */
function circleContent(c: RailCard): { kind: 'icon' | 'text'; iconId?: RailCard['icon']; value?: string } {
  if (c.kind === 'stat' && c.statPct != null) {
    return { kind: 'text', value: `${Math.round(c.statPct)}%` };
  }
  return { kind: 'icon', iconId: c.icon };
}

export function HomeRail({ cards }: Props) {
  const router = useRouter();
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
        {cards.map((c, i) => {
          const circle = circleContent(c);
          return (
            <button
              key={c.id}
              type="button"
              ref={(el) => { cardRefs.current[i] = el; }}
              data-rail-idx={i}
              className={cardClass(c, activeIdx === i)}
              style={c.kind === 'action' && c.tint === 'gold' ? { ['--tint' as string]: 'var(--dawn-gold)' } : undefined}
              onClick={() => router.push(c.href)}
            >
              <span
                className={`rail-card-circle rail-card-circle-${c.tint}${circle.kind === 'text' ? ' rail-card-circle-text' : ''}`}
                aria-hidden
              >
                {circle.kind === 'icon' && circle.iconId ? (
                  <RailLineIcon id={circle.iconId} size={22} className="rail-line-icon" />
                ) : (
                  circle.value
                )}
              </span>
              <div className="rail-card-body">
                <div className="rail-head">
                  <span className={`pill ${c.kind === 'action' || c.kind === 'stat' ? 'pill-active' : ''}`}>
                    {c.tag}
                  </span>
                </div>
                <div className="rail-title">{c.title}</div>
                {railShowsProgress(c) ? (
                  <div className="progress-bar rail-action-progress">
                    <div
                      className="progress-fill plan-fill"
                      style={{ width: `${Math.max(0, c.progressPct ?? 0)}%` }}
                    />
                  </div>
                ) : null}
                {c.sub ? (
                  <div className="rail-foot">
                    <span className="rail-sub">{c.sub}</span>
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
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
