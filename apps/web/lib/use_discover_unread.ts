'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ensureAccountReady, effectiveId } from '@/lib/api';
import { whenHomeBootstrapReady } from '@/lib/offline_bootstrap';
import { subscribeSocialRealtime } from '@/lib/social_realtime';

/** 底栏「发现」总未读：轻量 /social/unread-count（含申请/邀请 + 会话未读）。 */
export function useDiscoverUnread(enabled = true): number {
  const [count, setCount] = useState(0);

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

  useEffect(() => {
    if (!enabled) return;
    // 等首页就绪后再拉角标 / 订 SSE，避让冷启动带宽
    let cancelled = false;
    let unsub: (() => void) | null = null;
    let visTimer: number | null = null;
    whenHomeBootstrapReady(
      () => {
        if (cancelled) return;
        void refresh();
        unsub = subscribeSocialRealtime(
          (_c, changed) => {
            if (changed) void refresh();
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
      unsub?.();
      if (visTimer != null) window.clearTimeout(visTimer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, refresh]);

  return count;
}
