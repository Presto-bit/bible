/** 云同步状态（本地 outbox + 在线状态） */

import { pendingCount } from './sync';

export type SyncState = 'synced' | 'pending' | 'offline' | 'syncing';

let syncing = false;
let lastSyncedAt: number | null = null;

export function markSyncStart() {
  syncing = true;
}

export function markSyncDone() {
  syncing = false;
  lastSyncedAt = Date.now();
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
