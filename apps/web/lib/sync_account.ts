/** 云同步状态按 user_code 隔离（游标 / 迁移标记 / outbox） */

import { effectiveId } from './api';

const LEGACY_CURSOR_KEY = 'presto_sync_cursor';
const LEGACY_MIGRATE_KEY = 'presto_sync_migrated_v1';
const LEGACY_OUTBOX_KEY = 'presto_outbox';

export function syncAccountId(userCode?: string): string {
  return userCode || effectiveId();
}

export function cursorStorageKey(userCode?: string): string {
  return `presto_sync_cursor:${syncAccountId(userCode)}`;
}

export function migrateStorageKey(userCode?: string): string {
  return `presto_sync_migrated_v1:${syncAccountId(userCode)}`;
}

export function outboxStorageKey(userCode?: string): string {
  return `presto_outbox:${syncAccountId(userCode)}`;
}

export function readingProgressRemoteTsKey(userCode?: string): string {
  return `presto_reading_progress_remote_ts:${syncAccountId(userCode)}`;
}

export function readingProgressLocalTsKey(userCode?: string): string {
  return `presto_reading_progress_local_ts:${syncAccountId(userCode)}`;
}

export function getReadingProgressRemoteTs(userCode?: string): number {
  if (typeof window === 'undefined') return 0;
  return Number(localStorage.getItem(readingProgressRemoteTsKey(userCode)) || '0');
}

export function setReadingProgressRemoteTs(ms: number, userCode?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(readingProgressRemoteTsKey(userCode), String(ms));
}

export function getReadingProgressLocalTs(userCode?: string): number {
  if (typeof window === 'undefined') return 0;
  return Number(localStorage.getItem(readingProgressLocalTsKey(userCode)) || '0');
}

export function setReadingProgressLocalTs(ms: number, userCode?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(readingProgressLocalTsKey(userCode), String(ms));
}

export function getSyncCursor(userCode?: string): number {
  const id = syncAccountId(userCode);
  if (!id) return 0;
  const scoped = localStorage.getItem(cursorStorageKey(id));
  if (scoped != null) return Number(scoped) || 0;
  // 不按全局游标继承：全局 seq 跨账号共用，误用会拉不到当前账号历史
  return 0;
}

export function setSyncCursor(userCode: string, cursor: number) {
  localStorage.setItem(cursorStorageKey(userCode), String(cursor));
}

export function resetSyncCursor(userCode?: string) {
  const id = syncAccountId(userCode);
  if (!id) return;
  setSyncCursor(id, 0);
}

export function isSyncMigratedForUser(userCode?: string): boolean {
  const id = syncAccountId(userCode);
  if (!id) return false;
  const key = migrateStorageKey(id);
  if (localStorage.getItem(key) === '1') return true;
  const legacy = localStorage.getItem(LEGACY_MIGRATE_KEY);
  if (legacy === '1') {
    localStorage.setItem(key, '1');
    return true;
  }
  return false;
}

export function markSyncMigratedForUser(userCode?: string) {
  const id = syncAccountId(userCode);
  if (!id) return;
  localStorage.setItem(migrateStorageKey(id), '1');
}

/** 将旧版全局 outbox 一次性挂到当前账号（若存在） */
export function migrateLegacyOutboxIfNeeded(userCode?: string) {
  const id = syncAccountId(userCode);
  if (!id) return;
  const scopedKey = outboxStorageKey(id);
  if (localStorage.getItem(scopedKey)) return;
  const legacy = localStorage.getItem(LEGACY_OUTBOX_KEY);
  if (!legacy) return;
  localStorage.setItem(scopedKey, legacy);
  localStorage.removeItem(LEGACY_OUTBOX_KEY);
}

/** 清理已废弃的全局键（游标误用风险） */
export function dropLegacyGlobalSyncKeys() {
  localStorage.removeItem(LEGACY_CURSOR_KEY);
  localStorage.removeItem(LEGACY_MIGRATE_KEY);
}
