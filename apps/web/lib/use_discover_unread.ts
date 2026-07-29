'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ensureAccountReady, effectiveId } from '@/lib/api';
import { whenHomeBootstrapReady } from '@/lib/offline_bootstrap';
import { subscribeSocialRealtime } from '@/lib/social_realtime';

/** 底栏「发现」总未读：会话未读（跳过免打扰）+ 待处理好友申请。 */
export function useDiscoverUnread(enabled = true): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      await ensureAccountReady();
      if (!effectiveId()) {
        setCount(0);
        return;
      }
      const [conv, fr] = await Promise.allSettled([
        api.conversations(),
        api.friendRequests(),
      ]);
      let total = 0;
      if (conv.status === 'fulfilled') {
        for (const it of conv.value.items || []) {
          if (it.muted) continue;
          if (it.scope === 'inbox_friends' || it.scope === 'inbox_groups') {
            total += Math.max(0, it.unread || 0);
            continue;
          }
          total += Math.max(0, it.unread || 0);
        }
      }
      if (fr.status === 'fulfilled') {
        total += (fr.value.incoming || []).length;
      }
      setCount(total);
    } catch {
      /* 静默：角标失败不影响导航 */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // 等首页就绪后再拉角标 / 订 SSE，避让冷启动带宽
    let cancelled = false;
    let unsub: (() => void) | null = null;
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
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      unsub?.();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, refresh]);

  return count;
}
