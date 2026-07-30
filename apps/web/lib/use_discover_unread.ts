'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ensureAccountReady, effectiveId } from '@/lib/api';
import { whenHomeBootstrapReady } from '@/lib/offline_bootstrap';
import { subscribeSocialRealtime } from '@/lib/social_realtime';
import { subscribeDiscoverUnreadChanged } from '@/lib/discover_unread';

/** 底栏「发现」总未读：轻量 /social/unread-count（含申请/邀请 + 会话未读）。 */
export function useDiscoverUnread(enabled = true): number {
  const [count, setCount] = useState(0);
  const refreshTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      await ensureAccountReady();
      if (!effectiveId()) {
        setCount(0);
        return;
      }
      const res = await api.unreadCount();
      setCount(Math.max(0, res.unread || 0));
    } catch {
      /* 静默：角标失败不影响导航；旧后端无此接口时保持 0 */
    }
  }, []);

  const scheduleRefresh = useCallback(
    (delayMs = 80) => {
      if (refreshTimer.current != null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        void refresh();
      }, delayMs);
    },
    [refresh],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let unsubRealtime: (() => void) | null = null;
    let visTimer: number | null = null;

    // 本地「已读」事件立刻订阅，不拖到首页 bootstrap 之后
    const unsubLocal = subscribeDiscoverUnreadChanged((detail) => {
      if (typeof detail.delta === 'number' && detail.delta !== 0) {
        setCount((c) => Math.max(0, c + detail.delta!));
      }
      scheduleRefresh(detail.delta ? 120 : 0);
    });

    // 等首页就绪后再拉角标 / 订 SSE，避让冷启动带宽
    whenHomeBootstrapReady(
      () => {
        if (cancelled) return;
        void refresh();
        unsubRealtime = subscribeSocialRealtime(
          (_c, changed) => {
            if (changed) scheduleRefresh(200);
          },
          { watch: 'all', debounceMs: 300 },
        );
      },
      { afterMs: 5_000, fallbackMs: 20_000 },
    );
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (visTimer != null) window.clearTimeout(visTimer);
      visTimer = window.setTimeout(() => {
        void refresh();
      }, 400);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      unsubRealtime?.();
      unsubLocal();
      if (visTimer != null) window.clearTimeout(visTimer);
      if (refreshTimer.current != null) window.clearTimeout(refreshTimer.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, refresh, scheduleRefresh]);

  return count;
}
