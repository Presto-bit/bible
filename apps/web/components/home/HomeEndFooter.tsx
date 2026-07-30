'use client';

import { useEffect, useRef, useState } from 'react';
import { hapticLight } from '@/lib/haptic';

type Props = {
  /** 触底 overscroll 位移（px），由首页 PTR/底拉逻辑传入 */
  stretchPx?: number;
  reducedMotion?: boolean;
};

/** 到底哨兵：露出「已经到底了」；支持底拉轻弹性。 */
export function HomeEndFooter({ stretchPx = 0, reducedMotion = false }: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [atEnd, setAtEnd] = useState(false);
  const hapticOnceRef = useRef(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        setAtEnd(hit);
        if (hit && !hapticOnceRef.current) {
          hapticOnceRef.current = true;
          if (!reducedMotion) hapticLight();
        }
        if (!hit) hapticOnceRef.current = false;
      },
      { root: null, threshold: 0.4, rootMargin: '0px 0px -12px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reducedMotion]);

  const stretch = reducedMotion ? 0 : Math.max(0, stretchPx);
  const labelOpacity = atEnd ? 1 : 0.35;

  return (
    <div
      className={`home-end-footer${atEnd ? ' is-at-end' : ''}`}
      style={
        stretch > 0
          ? { transform: `translateY(${Math.min(stretch, 28)}px)` }
          : undefined
      }
      aria-hidden={!atEnd}
    >
      <div ref={sentinelRef} className="home-end-sentinel" />
      <p className="home-end-label" style={{ opacity: labelOpacity }}>
        · 已经到底了 ·
      </p>
    </div>
  );
}
