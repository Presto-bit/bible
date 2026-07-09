/** 首次将本机阅读/成就数据并入账号云同步 */

import { bulkPushLocalReadingLogs } from './reading_log_sync';
import { bulkPushLocalReadEvents } from './read_event_sync';
import { bulkPushLocalBadgeUnlocks } from './badge_unlock_sync';
import { loadBadgeStats } from './badge_events';
import { getReadingLogMap } from './reading';

const MIGRATE_KEY = 'presto_sync_migrated_v1';

export function hasLocalReadingData(): boolean {
  if (typeof window === 'undefined') return false;
  const logs = getReadingLogMap();
  if (Object.keys(logs).length > 0) return true;
  try {
    const events = JSON.parse(localStorage.getItem('presto_read_events') || '[]');
    if (Array.isArray(events) && events.length > 0) return true;
  } catch {
    /* ignore */
  }
  const stats = loadBadgeStats();
  return Object.keys(stats.unlocked_at).length > 0;
}

export function needsSyncMigration(): boolean {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem(MIGRATE_KEY) === '1') return false;
  return hasLocalReadingData();
}

export function markSyncMigrated() {
  localStorage.setItem(MIGRATE_KEY, '1');
}

/** 本机阅读日志、章节明细、已解锁成就 → outbox */
export function enqueueLocalReadingMigration() {
  bulkPushLocalReadingLogs();
  bulkPushLocalReadEvents();
  const stats = loadBadgeStats();
  const items = Object.entries(stats.unlocked_at).map(([id, unlockedAt]) => ({
    id,
    unlockedAt,
  }));
  bulkPushLocalBadgeUnlocks(items);
  markSyncMigrated();
}
