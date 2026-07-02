'use client';

import { useEffect, useState } from 'react';
import { getSyncState, syncStateLabel, type SyncState } from '@/lib/sync_status';
import { pendingCount } from '@/lib/sync';

export default function SyncStatusBadge() {
  const [state, setState] = useState<SyncState>('synced');

  useEffect(() => {
    const tick = () => setState(getSyncState());
    tick();
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    const id = window.setInterval(tick, 4000);
    return () => {
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
      window.clearInterval(id);
    };
  }, []);

  const pending = pendingCount();

  return (
    <div className="sync-status-badge" data-state={state}>
      <span className="sync-status-dot" aria-hidden />
      <span>{syncStateLabel(state)}</span>
      {pending > 0 && state !== 'offline' ? (
        <span className="muted" style={{ fontSize: 11 }}>（{pending} 条待上传）</span>
      ) : null}
    </div>
  );
}
