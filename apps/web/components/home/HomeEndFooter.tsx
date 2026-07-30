'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { hapticLight } from '@/lib/haptic';

type Props = {
  reducedMotion?: boolean;
};

/** 到底哨兵：露出「已经到底了」；底拉弹性由 PTR hook 直接改 transform。 */
export const HomeEndFooter = forwardRef<HTMLDivElement, Props>(
  function HomeEndFooter({ reducedMotion = false }, ref) {
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

    return (
      <div
        ref={ref}
        className={`home-end-footer${atEnd ? ' is-at-end' : ''}`}
        aria-hidden={!atEnd}
      >
        <div ref={sentinelRef} className="home-end-sentinel" />
        <p className="home-end-label">· 已经到底了 ·</p>
      </div>
    );
  },
);
