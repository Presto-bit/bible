'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { leaveFlutterH5IfNativeHref, leaveFlutterH5ToDiscover } from '@/lib/flutter_h5_bridge';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { PEIAI_MOTION_MS, prefersReducedMotion } from '@/lib/peiai_motion';

type EdgeSwipeBackOptions = {
  /** 固定返回路径；与 preferHistoryBack 二选一或组合使用 */
  href?: string;
  enabled?: boolean;
  /** true 时优先 router.back()（无历史再 push href） */
  preferHistoryBack?: boolean;
};

const EDGE_PX = 24;
const MIN_DX = 72;
const MAX_DY = 48;
const COMMIT_RATIO = 0.28;

function findSwipeTarget(): HTMLElement | null {
  const main = document.querySelector('main');
  if (main instanceof HTMLElement && main.offsetParent !== null) return main;
  const soft = document.querySelector('.soft-nav-transition-shell--live .soft-nav-live-main, .soft-nav-live-main');
  if (soft instanceof HTMLElement) return soft;
  const pane = document.querySelector('.tab-keep-pane.tab-keep-pane-active');
  if (pane instanceof HTMLElement) return pane;
  return null;
}

function sheetBlocking(): boolean {
  return Boolean(document.querySelector('.sheet-backdrop, .peiai-motion-sheet-backdrop, .listen-sheet-backdrop'));
}

/**
 * 左缘右滑返回（iOS 式）+ 跟手位移。
 * 勿用于读经器、Sheet 打开态。
 */
export function useEdgeSwipeBack({
  href,
  enabled = true,
  preferHistoryBack = false,
}: EdgeSwipeBackOptions) {
  const router = useRouter();
  const tracking = useRef<{
    x: number;
    y: number;
    active: boolean;
    following: boolean;
  } | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);

  const clearVisual = useCallback((animateBack: boolean) => {
    const el = targetRef.current;
    const scrim = scrimRef.current;
    if (el) {
      if (animateBack && !prefersReducedMotion()) {
        el.style.transition = `transform ${PEIAI_MOTION_MS.spring}ms cubic-bezier(0.16, 1, 0.3, 1)`;
        el.style.transform = 'translateX(0)';
        window.setTimeout(() => {
          el.style.transition = '';
          el.style.transform = '';
          el.classList.remove('peiai-edge-swipe-target');
        }, PEIAI_MOTION_MS.spring);
      } else {
        el.style.transition = '';
        el.style.transform = '';
        el.classList.remove('peiai-edge-swipe-target');
      }
    }
    if (scrim) {
      scrim.remove();
      scrimRef.current = null;
    }
    targetRef.current = null;
  }, []);

  const applyVisual = useCallback((dx: number) => {
    const el = targetRef.current;
    if (!el) return;
    const x = Math.max(0, dx);
    el.style.transition = 'none';
    el.style.transform = `translateX(${x}px)`;
    const scrim = scrimRef.current;
    if (scrim) {
      const w = window.innerWidth || 1;
      scrim.style.opacity = String(Math.min(0.35, (x / w) * 0.55));
    }
  }, []);

  const ensureVisual = useCallback(() => {
    if (prefersReducedMotion()) return;
    if (targetRef.current) return;
    const el = findSwipeTarget();
    if (!el) return;
    targetRef.current = el;
    el.classList.add('peiai-edge-swipe-target');
    const scrim = document.createElement('div');
    scrim.className = 'peiai-edge-swipe-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    document.body.appendChild(scrim);
    scrimRef.current = scrim;
  }, []);

  // 二级页进入轻过渡
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    if (prefersReducedMotion()) return;
    const main = document.querySelector('main');
    if (!main) return;
    main.classList.add('page-enter-soft');
    const t = window.setTimeout(() => main.classList.remove('page-enter-soft'), PEIAI_MOTION_MS.enter);
    return () => {
      window.clearTimeout(t);
      main.classList.remove('page-enter-soft');
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const goBack = () => {
      if (href === '/discover' || href?.startsWith('/discover/')) {
        if (leaveFlutterH5ToDiscover(href)) return;
      }
      if (leaveFlutterH5IfNativeHref(href)) return;
      if (preferHistoryBack && typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
        return;
      }
      if (href) {
        markRouteNavigation();
        router.push(href);
        return;
      }
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
      }
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (sheetBlocking()) return;
      const t = e.touches[0];
      if (t.clientX > EDGE_PX) return;
      tracking.current = { x: t.clientX, y: t.clientY, active: true, following: false };
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking.current?.active || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - tracking.current.x;
      const dy = Math.abs(t.clientY - tracking.current.y);
      if (!tracking.current.following) {
        if (dy > MAX_DY && dy > Math.abs(dx)) {
          tracking.current.active = false;
          clearVisual(true);
          return;
        }
        if (dx > 10) {
          tracking.current.following = true;
          ensureVisual();
        }
      }
      if (tracking.current.following) {
        applyVisual(dx);
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking.current?.active) {
        tracking.current = null;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - tracking.current.x;
      const following = tracking.current.following;
      tracking.current = null;
      const w = window.innerWidth || 375;
      const commit = dx >= MIN_DX || (following && dx / w >= COMMIT_RATIO);
      if (commit) {
        const el = targetRef.current;
        if (el && !prefersReducedMotion()) {
          el.style.transition = `transform ${PEIAI_MOTION_MS.normal}ms ease-out`;
          el.style.transform = `translateX(${w}px)`;
          const scrim = scrimRef.current;
          if (scrim) scrim.style.opacity = '0';
          window.setTimeout(() => {
            clearVisual(false);
            goBack();
          }, PEIAI_MOTION_MS.normal);
        } else {
          clearVisual(false);
          goBack();
        }
        return;
      }
      clearVisual(true);
    };

    const onCancel = () => {
      tracking.current = null;
      clearVisual(true);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      clearVisual(false);
    };
  }, [applyVisual, clearVisual, enabled, ensureVisual, href, preferHistoryBack, router]);
}

/** 常见固定返回路径 → 顶栏文案 */
export const BACK_PATH_LABELS: Record<string, string> = {
  '/': '首页',
  '/profile': '我的',
  '/profile/settings': '设置',
  '/profile?settings=1': '设置',
  '/reader': '圣经',
  '/discover': '消息',
  '/discover/contacts': '通讯录',
  '/discover/contacts/groups': '我的群',
  '/discover?tab=friends': '通讯录',
  '/discover/friends': '通讯录',
  '/discover/groups': '通讯录',
  '/search': '搜索',
  '/search/graph': '关系专题',
  '/search/map': '地图漫游',
  '/search/timeline': '时间轴',
  '/search/diagrams': '图鉴馆',
  '/dictionary': '词典',
  '/notes': '我的笔记',
  '/report': '读经回顾',
};

export function backLabelForHref(href: string): string {
  return BACK_PATH_LABELS[href] ?? '返回';
}

/**
 * 流程页返回：优先 history.back()，无历史时 push 到 fallback。
 * 边缘右滑与顶栏返回共用同一规则。
 */
export function useFlowBack(fallbackHref: string) {
  const router = useRouter();

  const goBack = useCallback(() => {
    if (fallbackHref === '/discover' || fallbackHref.startsWith('/discover/')) {
      if (leaveFlutterH5ToDiscover(fallbackHref)) return;
    }
    if (leaveFlutterH5IfNativeHref(fallbackHref)) return;
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }, [router, fallbackHref]);

  useEdgeSwipeBack({ href: fallbackHref, preferHistoryBack: true });

  return goBack;
}
