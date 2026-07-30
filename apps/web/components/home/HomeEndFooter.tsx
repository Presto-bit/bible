'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { hapticLight } from '@/lib/haptic';

type Props = {
  reducedMotion?: boolean;
};

const SESSION_KEY = 'presto_home_end_haptic_once';

function sessionHapticDone(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markSessionHaptic() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** 到底哨兵；每会话触觉最多 1 次；首屏短内容不震（需先离开再触底）。 */
export const HomeEndFooter = forwardRef<HTMLDivElement, Props>(
  function HomeEndFooter({ reducedMotion = false }, ref) {
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const [atEnd, setAtEnd] = useState(false);
    const leftEndOnceRef = useRef(false);
    const hapticArmedRef = useRef(!sessionHapticDone());

    useEffect(() => {
      const el = sentinelRef.current;
      if (!el) return;
      const io = new IntersectionObserver(
        (entries) => {
          const hit = entries.some((e) => e.isIntersecting);
          setAtEnd(hit);
          if (!hit) {
            leftEndOnceRef.current = true;
            return;
          }
          // 短页首屏即到底：只展示文案，不震；离开后再触底才震
          if (
            hit &&
            leftEndOnceRef.current &&
            hapticArmedRef.current &&
            !reducedMotion
          ) {
            hapticArmedRef.current = false;
            markSessionHaptic();
            hapticLight();
          }
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
