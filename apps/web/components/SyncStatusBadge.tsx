'use client';

import { useEffect, useState } from 'react';
import { getSyncState, subscribeSyncState, syncStateLabel, type SyncState } from '@/lib/sync_status';
import {
  pendingCount,
  retryPendingUpload,
  shouldMuteSyncFailPrompt,
} from '@/lib/sync';

/** 云同步状态：可点击重试上传；连续失败多次后不再提示失败文案 */
export default function SyncStatusBadge() {
  const [state, setState] = useState<SyncState>('synced');
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [muteFail, setMuteFail] = useState(false);

  useEffect(() => {
    const tick = () => {
      setState(getSyncState());
      setPending(pendingCount());
      setMuteFail(shouldMuteSyncFailPrompt());
    };
    tick();
    const unsub = subscribeSyncState(tick);
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    const id = window.setInterval(tick, 8000);
    return () => {
      unsub();
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
      window.clearInterval(id);
    };
  }, []);

  const canClick = pending > 0 && !busy && state !== 'syncing';

  const onRetry = async () => {
    if (!canClick) return;
    if (state === 'offline') {
      if (!shouldMuteSyncFailPrompt()) {
        setHint('当前离线，请联网后再试');
      }
      return;
    }
    setBusy(true);
    setHint(null);
    try {
      await retryPendingUpload();
      const left = pendingCount();
      setPending(left);
      setState(getSyncState());
      setMuteFail(shouldMuteSyncFailPrompt());
      if (left === 0) {
        setHint(null);
      } else if (!shouldMuteSyncFailPrompt()) {
        setHint('仍有条目未上传，可再点重试');
      } else {
        setHint(null);
      }
    } catch {
      setMuteFail(shouldMuteSyncFailPrompt());
      if (!shouldMuteSyncFailPrompt()) {
        setHint('上传失败，请检查网络后重试');
      } else {
        setHint(null);
      }
      setPending(pendingCount());
      setState(getSyncState());
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="sync-status-badge"
      data-state={state}
      role="status"
      aria-live="polite"
      disabled={!canClick}
      title={canClick ? '点击重新上传' : undefined}
      onClick={() => void onRetry()}
      style={{
        cursor: canClick ? 'pointer' : 'default',
        border: 'none',
        background: 'transparent',
        padding: 0,
        font: 'inherit',
        textAlign: 'left',
      }}
    >
      <span className="sync-status-dot" aria-hidden />
      <span>{busy || state === 'syncing' ? '同步中…' : syncStateLabel(state)}</span>
      {pending > 0 && state !== 'offline' ? (
        <span className="muted" style={{ fontSize: 11 }}>
          （{pending} 条待上传{canClick ? ' · 点此重试' : ''}）
        </span>
      ) : null}
      {hint && !muteFail ? (
        <span className="muted" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
          {hint}
        </span>
      ) : null}
    </button>
  );
}
