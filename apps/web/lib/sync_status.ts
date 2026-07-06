/** 云同步状态（本地 outbox + 在线状态，多 Tab 广播） */

import { pendingCount } from './sync';

export type SyncState = 'synced' | 'pending' | 'offline' | 'syncing';

const SYNC_CHANNEL = 'presto-sync-state';

let syncing = false;
let lastSyncedAt: number | null = null;
const listeners = new Set<() => void>();

function notifyLocal() {
  listeners.forEach((fn) => fn());
}

const syncChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SYNC_CHANNEL) : null;

if (syncChannel) {
  syncChannel.onmessage = (ev: MessageEvent<{ type: string }>) => {
    if (ev.data?.type === 'sync-start') syncing = true;
    if (ev.data?.type === 'sync-done') {
      syncing = false;
      lastSyncedAt = Date.now();
    }
    notifyLocal();
  };
}

export function subscribeSyncState(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function markSyncStart() {
  syncing = true;
  notifyLocal();
  syncChannel?.postMessage({ type: 'sync-start' });
}

export function markSyncDone() {
  syncing = false;
  lastSyncedAt = Date.now();
  notifyLocal();
  syncChannel?.postMessage({ type: 'sync-done' });
}

export function getLastSyncedAt(): number | null {
  return lastSyncedAt;
}

export function getSyncState(): SyncState {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  if (syncing) return 'syncing';
  if (pendingCount() > 0) return 'pending';
  return 'synced';
}

export function syncStateLabel(state: SyncState): string {
  switch (state) {
    case 'offline':
      return '离线 · 待同步';
    case 'pending':
      return '待同步';
    case 'syncing':
      return '同步中…';
    default:
      return '已同步到云端';
  }
}
