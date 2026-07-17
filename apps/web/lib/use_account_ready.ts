'use client';

import { useCallback, useEffect, useState } from 'react';
import { ensureAccountReady, effectiveId, resetAccountEnsureCaches } from '@/lib/api';

const DEFAULT_TIMEOUT_MS = 12_000;

export type AccountReadyState =
  | { status: 'loading' }
  | { status: 'ready'; uid: string }
  | { status: 'timeout' };

/** U6：账号就绪带超时与重试；离线优先用本地 ID，避免整页卡死。 */
export function useAccountReady(timeoutMs = DEFAULT_TIMEOUT_MS): AccountReadyState & { retry: () => void } {
  const [state, setState] = useState<AccountReadyState>(() => {
    const uid = typeof window !== 'undefined' ? effectiveId() : '';
    return uid ? { status: 'ready', uid } : { status: 'loading' };
  });
  const [tick, setTick] = useState(0);

  const retry = useCallback(() => {
    resetAccountEnsureCaches();
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const localUid = effectiveId();
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    // 离线且本地已有 ID：立刻可用，不阻塞发现/消息页
    if (offline && localUid) {
      setState({ status: 'ready', uid: localUid });
      return;
    }

    if (!localUid) setState({ status: 'loading' });

    const finish = (uid: string | null) => {
      if (cancelled) return;
      if (uid) setState({ status: 'ready', uid });
      else setState({ status: 'timeout' });
    };

    const timer = window.setTimeout(() => {
      finish(effectiveId() || null);
    }, timeoutMs);

    void ensureAccountReady()
      .then(() => {
        window.clearTimeout(timer);
        finish(effectiveId() || null);
      })
      .catch(() => {
        window.clearTimeout(timer);
        finish(effectiveId() || null);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [timeoutMs, tick]);

  return { ...state, retry };
}
