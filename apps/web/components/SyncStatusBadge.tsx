'use client';

import { useEffect, useState } from 'react';
import { getSyncState, subscribeSyncState, syncStateLabel, type SyncState } from '@/lib/sync_status';
import { pendingCount } from '@/lib/sync';

/** 云同步状态展示（后台自动同步，无需用户点击） */
export default function SyncStatusBadge() {
  const [state, setState] = useState<SyncState>('synced');
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const tick = () => {
      setState(getSyncState());
      setPending(pendingCount());
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

  return (
    <span className="sync-status-badge" data-state={state} role="status" aria-live="polite">
      <span className="sync-status-dot" aria-hidden />
      <span>{syncStateLabel(state)}</span>
      {pending > 0 && state !== 'offline' ? (
        <span className="muted" style={{ fontSize: 11 }}>（{pending} 条待上传）</span>
      ) : null}
    </span>
  );
}
