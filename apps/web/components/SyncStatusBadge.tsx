'use client';

import { useEffect, useState } from 'react';
import { getSyncState, subscribeSyncState, syncStateLabel, type SyncState } from '@/lib/sync_status';
import { pendingCount, syncNow } from '@/lib/sync';

export default function SyncStatusBadge() {
  const [state, setState] = useState<SyncState>('synced');
  const [toast, setToast] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setState(getSyncState());
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

  const pending = pendingCount();

  const handleClick = async () => {
    if (state === 'offline') {
      setToast('当前离线，联网后将自动同步');
      window.setTimeout(() => setToast(null), 2000);
      return;
    }
    if (state === 'syncing') return;
    if (state === 'pending' || pending > 0) {
      setToast('正在同步…');
      try {
        await syncNow();
        setLastSync(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        setToast('同步完成');
      } catch {
        setToast('同步失败，请稍后重试');
      }
      window.setTimeout(() => setToast(null), 2000);
      return;
    }
    setToast(lastSync ? `已同步 · ${lastSync}` : '已与云端同步');
    window.setTimeout(() => setToast(null), 1800);
  };

  return (
    <>
      <button type="button" className="sync-status-badge" data-state={state} onClick={() => void handleClick()}>
        <span className="sync-status-dot" aria-hidden />
        <span>{syncStateLabel(state)}</span>
        {pending > 0 && state !== 'offline' ? (
          <span className="muted" style={{ fontSize: 11 }}>（{pending} 条待上传）</span>
        ) : null}
      </button>
      {toast ? <span className="sync-status-toast">{toast}</span> : null}
    </>
  );
}
