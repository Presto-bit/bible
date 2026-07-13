'use client';

import { useEffect, useState } from 'react';
import {
  getSyncState,
  subscribeSyncState,
  syncStateLabel,
  forceMarkSyncIdle,
  type SyncState,
} from '@/lib/sync_status';
import {
  pendingCount,
  retryPendingUpload,
  shouldMuteSyncFailPrompt,
} from '@/lib/sync';
import { useToast } from '@/components/ui/ToastProvider';

/** 云同步状态：小号文案；有待传时可点重试，不展示条数 */
export default function SyncStatusBadge() {
  const toast = useToast();
  const [state, setState] = useState<SyncState>('synced');
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const tick = () => {
      setState(getSyncState());
      setPending(pendingCount());
    };
    tick();
    const unsub = subscribeSyncState(tick);
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    const id = window.setInterval(tick, 3000);
    return () => {
      unsub();
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
      window.clearInterval(id);
    };
  }, []);

  const canClick = pending > 0 && !busy;

  const onRetry = async () => {
    if (!canClick) return;
    if (state === 'offline') {
      toast('当前离线，请联网后再试');
      return;
    }
    const before = pendingCount();
    setBusy(true);
    forceMarkSyncIdle();
    try {
      await retryPendingUpload();
      const left = pendingCount();
      setPending(left);
      setState(getSyncState());
      if (left === 0) {
        toast('已同步到云端');
      } else if (left < before) {
        toast(`已上传一部分，仍有 ${left} 条待同步`);
      } else if (!shouldMuteSyncFailPrompt()) {
        toast('上传未成功，请稍后重试');
      }
    } catch (e) {
      forceMarkSyncIdle();
      const msg = e instanceof Error && e.message ? e.message : '同步失败，请稍后重试';
      if (!shouldMuteSyncFailPrompt()) toast(msg);
      setPending(pendingCount());
      setState(getSyncState());
    } finally {
      setBusy(false);
      forceMarkSyncIdle();
    }
  };

  const raw = busy ? '同步中…' : syncStateLabel(state);
  const label =
    raw === '已同步到云端'
      ? '已同步'
      : raw === '离线 · 待同步'
        ? '离线'
        : raw === '同步中…'
          ? '同步中'
          : raw;

  return (
    <button
      type="button"
      className="sync-status-badge sync-status-badge--compact"
      data-state={state}
      role="status"
      aria-live="polite"
      disabled={!canClick}
      title={
        canClick
          ? `点击重新上传（${pending} 条待同步）`
          : pending > 0
            ? `${pending} 条待同步`
            : undefined
      }
      onClick={() => void onRetry()}
    >
      <span className="sync-status-dot" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
