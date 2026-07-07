'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

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

/**
 * 左缘右滑返回（iOS 式）。勿用于读经器、Sheet 打开态。
 */
export function useEdgeSwipeBack({
  href,
  enabled = true,
  preferHistoryBack = false,
}: EdgeSwipeBackOptions) {
  const router = useRouter();
  const tracking = useRef<{ x: number; y: number; active: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const goBack = () => {
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
      const t = e.touches[0];
      if (t.clientX > EDGE_PX) return;
      tracking.current = { x: t.clientX, y: t.clientY, active: true };
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking.current?.active || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - tracking.current.x;
      const dy = Math.abs(t.clientY - tracking.current.y);
      if (dy > MAX_DY && dy > Math.abs(dx)) {
        tracking.current.active = false;
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking.current?.active) {
        tracking.current = null;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - tracking.current.x;
      tracking.current = null;
      if (dx >= MIN_DX) goBack();
    };

    const onCancel = () => {
      tracking.current = null;
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
    };
  }, [enabled, href, preferHistoryBack, router]);
}

/** 常见固定返回路径 → 顶栏文案 */
export const BACK_PATH_LABELS: Record<string, string> = {
  '/': '首页',
  '/profile': '我的',
  '/profile?settings=1': '设置',
  '/reader': '圣经',
  '/discover': '发现',
  '/discover/friends': '好友',
  '/discover/groups': '群列表',
  '/search': '搜索',
  '/search/graph': '关系专题',
  '/search/map': '地图漫游',
  '/search/timeline': '时间轴',
  '/search/diagrams': '图鉴馆',
  '/dictionary': '词典',
  '/notes': '我的想法',
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
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }, [router, fallbackHref]);

  useEdgeSwipeBack({ href: fallbackHref, preferHistoryBack: true });

  return goBack;
}
