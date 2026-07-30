'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  HOME_PTR_MIN_INTERVAL_MS as HOME_PTR_MIN_INTERVAL_FROM_REFRESH,
} from './home_refresh';

export const HOME_PTR_THRESHOLD_PX = 64;
export const HOME_PTR_MAX_PX = 96;
export const HOME_PTR_MIN_INTERVAL_MS = HOME_PTR_MIN_INTERVAL_FROM_REFRESH;
export const HOME_BOTTOM_STRETCH_MAX_PX = 36;

type Opts = {
  enabled: boolean;
  reducedMotion: boolean;
  onRefresh: () => Promise<void>;
};

function scrollTop(): number {
  if (typeof window === 'undefined') return 0;
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function atDocumentBottom(slack = 8): boolean {
  if (typeof window === 'undefined') return true;
  const doc = document.documentElement;
  const bottom = window.innerHeight + scrollTop();
  return bottom >= doc.scrollHeight - slack;
}

/**
 * 首页顶下拉刷新 + 底 overscroll 轻弹性。
 * 横滑主导时不抢手势；底拉不触发刷新。
 */
export function useHomePullRefresh({ enabled, reducedMotion, onRefresh }: Opts) {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [bottomStretch, setBottomStretch] = useState(0);
  const [canRelease, setCanRelease] = useState(false);

  const pullRef = useRef(0);
  const bottomRef = useRef(0);
  const modeRef = useRef<'none' | 'top' | 'bottom'>('none');
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setPull = useCallback((n: number) => {
    pullRef.current = n;
    setPullPx(n);
    setCanRelease(n >= HOME_PTR_THRESHOLD_PX);
  }, []);

  const setBottom = useCallback((n: number) => {
    bottomRef.current = n;
    setBottomStretch(n);
  }, []);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < HOME_PTR_MIN_INTERVAL_MS) {
      setPull(0);
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    lastRefreshAtRef.current = now;
    try {
      await onRefreshRef.current();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
    }
  }, [setPull]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      startYRef.current = t.clientY;
      startXRef.current = t.clientX;
      modeRef.current = 'none';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dy = t.clientY - startYRef.current;
      const dx = t.clientX - startXRef.current;

      if (modeRef.current === 'none') {
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
          modeRef.current = 'none';
          return; // 横滑交给 hero
        }
        if (dy > 8 && scrollTop() <= 0) {
          modeRef.current = 'top';
        } else if (dy < -8 && atDocumentBottom()) {
          modeRef.current = 'bottom';
        } else {
          return;
        }
      }

      if (modeRef.current === 'top') {
        if (scrollTop() > 0) {
          modeRef.current = 'none';
          setPull(0);
          return;
        }
        const raw = Math.max(0, dy);
        const damp = reducedMotion ? 0 : 0.48;
        const next = reducedMotion
          ? Math.min(raw * 0.2, HOME_PTR_THRESHOLD_PX)
          : Math.min(raw * damp, HOME_PTR_MAX_PX);
        setPull(next);
        setBottom(0);
        if (next > 0 && e.cancelable) e.preventDefault();
        return;
      }

      if (modeRef.current === 'bottom') {
        if (!atDocumentBottom(16)) {
          modeRef.current = 'none';
          setBottom(0);
          return;
        }
        const raw = Math.max(0, -dy);
        const next = reducedMotion
          ? 0
          : Math.min(raw * 0.35, HOME_BOTTOM_STRETCH_MAX_PX);
        setBottom(next);
        setPull(0);
        if (next > 0 && e.cancelable) e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      const mode = modeRef.current;
      modeRef.current = 'none';
      if (mode === 'top') {
        if (pullRef.current >= HOME_PTR_THRESHOLD_PX) {
          void runRefresh();
        } else {
          setPull(0);
        }
        return;
      }
      if (mode === 'bottom') {
        setBottom(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, reducedMotion, runRefresh, setBottom, setPull]);

  return {
    pullPx,
    refreshing,
    canRelease,
    bottomStretch,
    contentOffset: refreshing
      ? Math.min(HOME_PTR_THRESHOLD_PX * 0.55, 36)
      : pullPx,
  };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  return reduced;
}
