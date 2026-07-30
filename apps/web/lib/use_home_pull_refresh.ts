'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import {
  HOME_PTR_MIN_INTERVAL_MS as HOME_PTR_MIN_INTERVAL_FROM_REFRESH,
} from './home_refresh';

export const HOME_PTR_THRESHOLD_PX = 64;
export const HOME_PTR_MAX_PX = 88;
export const HOME_PTR_MIN_INTERVAL_MS = HOME_PTR_MIN_INTERVAL_FROM_REFRESH;
export const HOME_BOTTOM_STRETCH_MAX_PX = 28;
export const HOME_PTR_BUSY_PX = 32;

export type HomePtrPhase = 'idle' | 'pull' | 'release' | 'busy';

type Opts = {
  enabled: boolean;
  reducedMotion: boolean;
  onRefresh: () => Promise<void>;
  rootRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  indicatorRef: RefObject<HTMLElement | null>;
  labelRef: RefObject<HTMLElement | null>;
  endFooterRef?: RefObject<HTMLElement | null>;
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

/** 橡胶阻尼：跟手但不线性顶死，减轻「顿一下」感 */
function dampPull(raw: number, max: number, factor: number): number {
  if (raw <= 0) return 0;
  const t = Math.min(1, raw / (max * 2.2));
  return Math.min(max, raw * factor * (1 - t * 0.45));
}

function phaseLabel(phase: HomePtrPhase): string {
  if (phase === 'busy') return '更新中';
  if (phase === 'release') return '松开刷新';
  if (phase === 'pull') return '下拉刷新';
  return '';
}

/**
 * 首页顶下拉刷新 + 底 overscroll。
 * 拖动过程只改 DOM transform（rAF），不 setState，避免整页卡顿。
 */
export function useHomePullRefresh({
  enabled,
  reducedMotion,
  onRefresh,
  rootRef,
  contentRef,
  indicatorRef,
  labelRef,
  endFooterRef,
}: Opts) {
  const [phase, setPhase] = useState<HomePtrPhase>('idle');
  const [refreshing, setRefreshing] = useState(false);

  const pullRef = useRef(0);
  const bottomRef = useRef(0);
  const modeRef = useRef<'none' | 'top' | 'bottom'>('none');
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const refreshingRef = useRef(false);
  const phaseRef = useRef<HomePtrPhase>('idle');
  const rafRef = useRef(0);
  const pendingPullRef = useRef<number | null>(null);
  const pendingBottomRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const reducedRef = useRef(reducedMotion);
  onRefreshRef.current = onRefresh;
  reducedRef.current = reducedMotion;

  const applyPhase = useCallback((next: HomePtrPhase) => {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    setPhase(next);
    const label = labelRef.current;
    if (label) {
      label.textContent = phaseLabel(next);
      label.classList.toggle('is-busy', next === 'busy');
    }
  }, [labelRef]);

  const paintTop = useCallback((n: number, withTransition: boolean) => {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    const root = rootRef.current;
    if (!content || !indicator) return;

    const y = Math.max(0, n);
    pullRef.current = y;

    if (withTransition) {
      content.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
      indicator.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.18s ease';
    } else {
      content.style.transition = 'none';
      indicator.style.transition = 'none';
    }

    content.style.transform = y > 0.5 ? `translate3d(0, ${y}px, 0)` : '';
    // 指示器固定占位高度，用 translate 露出，避免改 height 触发布局
    indicator.style.transform = `translate3d(0, ${y - HOME_PTR_MAX_PX}px, 0)`;
    indicator.style.opacity = y > 8 || phaseRef.current === 'busy' ? '1' : '0';
    root?.classList.toggle('is-ptr-pulling', y > 0.5 && phaseRef.current !== 'busy');
  }, [contentRef, indicatorRef, rootRef]);

  const paintBottom = useCallback((n: number, withTransition: boolean) => {
    const footer = endFooterRef?.current;
    if (!footer) return;
    const y = Math.max(0, n);
    bottomRef.current = y;
    footer.style.transition = withTransition
      ? 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
      : 'none';
    footer.style.transform = y > 0.5 ? `translate3d(0, ${Math.min(y, HOME_BOTTOM_STRETCH_MAX_PX)}px, 0)` : '';
  }, [endFooterRef]);

  const schedulePaintTop = useCallback((n: number) => {
    pendingPullRef.current = n;
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      const pull = pendingPullRef.current;
      const bottom = pendingBottomRef.current;
      pendingPullRef.current = null;
      pendingBottomRef.current = null;
      if (pull != null) {
        paintTop(pull, false);
        if (pull >= HOME_PTR_THRESHOLD_PX) applyPhase('release');
        else if (pull > 12) applyPhase('pull');
        else if (phaseRef.current !== 'busy') applyPhase('idle');
      }
      if (bottom != null) paintBottom(bottom, false);
    });
  }, [applyPhase, paintBottom, paintTop]);

  const schedulePaintBottom = useCallback((n: number) => {
    pendingBottomRef.current = n;
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      const pull = pendingPullRef.current;
      const bottom = pendingBottomRef.current;
      pendingPullRef.current = null;
      pendingBottomRef.current = null;
      if (pull != null) {
        paintTop(pull, false);
        if (pull >= HOME_PTR_THRESHOLD_PX) applyPhase('release');
        else if (pull > 12) applyPhase('pull');
        else if (phaseRef.current !== 'busy') applyPhase('idle');
      }
      if (bottom != null) paintBottom(bottom, false);
    });
  }, [applyPhase, paintBottom, paintTop]);

  const resetTop = useCallback((animated: boolean) => {
    paintTop(0, animated && !reducedRef.current);
    if (phaseRef.current !== 'busy') applyPhase('idle');
    rootRef.current?.classList.remove('is-ptr-pulling');
  }, [applyPhase, paintTop, rootRef]);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < HOME_PTR_MIN_INTERVAL_MS) {
      resetTop(true);
      return;
    }
    refreshingRef.current = true;
    lastRefreshAtRef.current = now;
    setRefreshing(true);
    applyPhase('busy');
    paintTop(HOME_PTR_BUSY_PX, !reducedRef.current);
    rootRef.current?.classList.add('is-ptr-refreshing');
    rootRef.current?.classList.remove('is-ptr-pulling');
    try {
      await onRefreshRef.current();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      rootRef.current?.classList.remove('is-ptr-refreshing');
      resetTop(true);
    }
  }, [applyPhase, paintTop, resetTop, rootRef]);

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
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.1) return;
        if (dy > 6 && scrollTop() <= 0) modeRef.current = 'top';
        else if (dy < -6 && atDocumentBottom()) modeRef.current = 'bottom';
        else return;
      }

      if (modeRef.current === 'top') {
        if (scrollTop() > 0) {
          modeRef.current = 'none';
          resetTop(false);
          return;
        }
        const reduced = reducedRef.current;
        const next = reduced
          ? Math.min(Math.max(0, dy) * 0.18, HOME_PTR_THRESHOLD_PX)
          : dampPull(Math.max(0, dy), HOME_PTR_MAX_PX, 0.55);
        schedulePaintTop(next);
        if (bottomRef.current) paintBottom(0, false);
        if (next > 0 && e.cancelable) e.preventDefault();
        return;
      }

      if (modeRef.current === 'bottom') {
        if (!atDocumentBottom(16)) {
          modeRef.current = 'none';
          paintBottom(0, false);
          return;
        }
        if (reducedRef.current) return;
        const next = dampPull(Math.max(0, -dy), HOME_BOTTOM_STRETCH_MAX_PX, 0.4);
        schedulePaintBottom(next);
        if (next > 0 && e.cancelable) e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      const mode = modeRef.current;
      modeRef.current = 'none';
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      pendingPullRef.current = null;
      pendingBottomRef.current = null;

      if (mode === 'top') {
        if (pullRef.current >= HOME_PTR_THRESHOLD_PX) void runRefresh();
        else resetTop(true);
        return;
      }
      if (mode === 'bottom') {
        paintBottom(0, !reducedRef.current);
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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    enabled,
    paintBottom,
    resetTop,
    runRefresh,
    schedulePaintBottom,
    schedulePaintTop,
  ]);

  return { phase, refreshing };
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
