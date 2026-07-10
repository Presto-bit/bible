'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { railDotClass, type RailCard } from '@/lib/home_rail';
import { isTabKeepAliveEnabled } from '@/lib/platform';
import { isPwaMainTabHref, navigatePwaTab, navigateToReaderHref } from '@/lib/pwa_tab_nav';
import { RailCardVisual } from '@/components/home/RailCardVisual';

type Props = {
  cards: RailCard[];
};

function cardClass(c: RailCard, active: boolean): string {
  const parts = [
    'rail-card',
    'rail-card-content',
    'card',
    `card-${c.kind}`,
    `card-tint-${c.tint}`,
    `rail-card-layout-${c.layout}`,
    c.kind === 'action' ? 'card-3 card-tint card-accent rail-card-action' : 'card-2 card-tint',
    active ? 'rail-card-active' : 'rail-card-inactive',
  ];
  return parts.filter(Boolean).join(' ');
}

function navigateRailHref(href: string, router: ReturnType<typeof useRouter>) {
  if (href.startsWith('/reader')) {
    navigateToReaderHref(href, router);
    return;
  }
  if (isTabKeepAliveEnabled() && isPwaMainTabHref(href)) {
    navigatePwaTab(href);
    return;
  }
  router.push(href);
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
        {cards.map((c, i) => (
          <button
            key={c.id}
            type="button"
            ref={(el) => { cardRefs.current[i] = el; }}
            data-rail-idx={i}
            className={cardClass(c, activeIdx === i)}
            style={c.kind === 'action' && c.tint === 'gold' ? { ['--tint' as string]: 'var(--dawn-gold)' } : undefined}
            onClick={() => navigateRailHref(c.href, router)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <RailCardVisual card={c} />
            <div className="rail-card-body rail-card-body-padded">
              <div className="rail-head">
                <span className={`pill ${c.kind === 'action' || c.kind === 'stat' ? 'pill-active' : ''}`}>
                  {c.tag}
                </span>
              </div>
              {c.layout !== 'verse' ? (
                <div className="rail-title">{c.title}</div>
              ) : (
                <div className="rail-title rail-title-verse-hint">问小爱这段经文</div>
              )}
              {c.sub ? (
                <div className="rail-foot">
                  <span className="rail-sub">{c.sub}</span>
                </div>
              ) : null}
            </div>
          </button>
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
