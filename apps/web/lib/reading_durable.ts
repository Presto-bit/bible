/**
 * 读经本地快照：写入 IndexedDB（与 device_id 同库），抵御删 PWA 图标后
 * localStorage 被清、但 IDB/Cookie 仍在的情况。
 */

import { effectiveId } from './api';
import { notifyLocalDataChanged } from './local_data_events';
import {
  lastReadStorageKey,
  lastVerseMapStorageKey,
  migrateLegacyReadingStorageIfNeeded,
  readEventsStorageKey,
  readingLogStorageKey,
} from './reading_storage';
import { scopedUserKey, migrateLegacyUserStorageIfNeeded } from './user_storage';

const IDB_NAME = 'presto_identity';
const IDB_STORE = 'kv';
const SNAPSHOT_PREFIX = 'reading_snapshot_v1:';

const LS_BADGE_STATS_BASE = 'presto_badge_stats';

type Snapshot = {
  userCode: string;
  savedAt: number;
  readingLog: string | null;
  lastRead: string | null;
  lastVerse: string | null;
  readEvents: string | null;
  badgeStats: string | null;
};

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openIdb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* 备份失败不阻断 */
  }
}

function snapshotKey(userCode: string) {
  return `${SNAPSHOT_PREFIX}${userCode}`;
}

function readLs(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string | null) {
  if (value == null || value === '') {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, value);
}

function localHasAnyReading(userCode: string): boolean {
  migrateLegacyReadingStorageIfNeeded(userCode);
  try {
    const log = JSON.parse(localStorage.getItem(readingLogStorageKey(userCode)) || '{}');
    if (log && typeof log === 'object' && Object.keys(log).length > 0) return true;
  } catch {
    /* ignore */
  }
  if (localStorage.getItem(lastReadStorageKey(userCode))) return true;
  try {
    const ev = JSON.parse(localStorage.getItem(readEventsStorageKey(userCode)) || '[]');
    if (Array.isArray(ev) && ev.length > 0) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** 将当前 localStorage 读经状态备份到 IDB（按 user_code） */
export async function backupLocalReadingSnapshot(userCode?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const code = userCode || effectiveId();
  if (!code) return;
  migrateLegacyReadingStorageIfNeeded(code);
  if (!localHasAnyReading(code)) return;
  const snap: Snapshot = {
    userCode: code,
    savedAt: Date.now(),
    readingLog: readLs(readingLogStorageKey(code)),
    lastRead: readLs(lastReadStorageKey(code)),
    lastVerse: readLs(lastVerseMapStorageKey(code)),
    readEvents: readLs(readEventsStorageKey(code)),
    badgeStats: (migrateLegacyUserStorageIfNeeded(code), readLs(scopedUserKey(LS_BADGE_STATS_BASE, code))),
  };
  await idbSet(snapshotKey(code), JSON.stringify(snap));
}

/**
 * 本机 localStorage 为空时，从 IDB 快照恢复。
 * @returns 是否写入了本地数据
 */
export async function restoreLocalReadingSnapshotIfNeeded(
  userCode?: string,
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const code = userCode || effectiveId();
  if (!code) return false;
  migrateLegacyReadingStorageIfNeeded(code);
  if (localHasAnyReading(code)) return false;

  const raw = await idbGet(snapshotKey(code));
  if (!raw) return false;
  let snap: Snapshot;
  try {
    snap = JSON.parse(raw) as Snapshot;
  } catch {
    return false;
  }
  if (!snap || snap.userCode !== code) return false;
  if (!snap.readingLog && !snap.lastRead && !snap.readEvents) return false;

  writeLs(readingLogStorageKey(code), snap.readingLog);
  writeLs(lastReadStorageKey(code), snap.lastRead);
  writeLs(lastVerseMapStorageKey(code), snap.lastVerse);
  writeLs(readEventsStorageKey(code), snap.readEvents);
  if (snap.badgeStats) writeLs(scopedUserKey(LS_BADGE_STATS_BASE, code), snap.badgeStats);
  notifyLocalDataChanged('idb-reading-restore');
  return true;
}

let backupTimer: number | null = null;

/** 防抖备份（阅读写入频繁时合并） */
export function scheduleReadingSnapshotBackup(userCode?: string) {
  if (typeof window === 'undefined') return;
  if (backupTimer != null) window.clearTimeout(backupTimer);
  backupTimer = window.setTimeout(() => {
    backupTimer = null;
    void backupLocalReadingSnapshot(userCode);
  }, 800);
}
