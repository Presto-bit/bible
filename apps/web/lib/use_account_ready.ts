'use client';

import { useCallback, useEffect, useState } from 'react';
import { ensureAccountReady, effectiveId, resetAccountEnsureCaches } from '@/lib/api';

const DEFAULT_TIMEOUT_MS = 12_000;

export type AccountReadyState =
  | { status: 'loading' }
  | { status: 'ready'; uid: string }
  | { status: 'timeout' };

/** U6：账号就绪带超时与重试 */
export function useAccountReady(timeoutMs = DEFAULT_TIMEOUT_MS): AccountReadyState & { retry: () => void } {
  const [state, setState] = useState<AccountReadyState>({ status: 'loading' });
  const [tick, setTick] = useState(0);

  const retry = useCallback(() => {
    resetAccountEnsureCaches();
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const timer = window.setTimeout(() => {
      if (!cancelled && !effectiveId()) setState({ status: 'timeout' });
    }, timeoutMs);

    void ensureAccountReady().then(() => {
      if (cancelled) return;
      const uid = effectiveId();
      if (uid) {
        window.clearTimeout(timer);
        setState({ status: 'ready', uid });
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [timeoutMs, tick]);

  return { ...state, retry };
}
