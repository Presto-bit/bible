/**
 * 读经本地存储按 user_code 分桶，避免同机多账号 / 网页与 PWA 身份一致时串数据。
 * 首次读取时把旧版全局键迁入当前账号桶。
 */

import { effectiveId } from './api';

const LEGACY = {
  readingLog: 'presto_reading_log',
  secBuffer: 'presto_read_sec_buffer',
  lastRead: 'presto_last_read',
  lastVerse: 'presto_last_verse',
  readEvents: 'presto_read_events',
  verseEvents: 'presto_verse_events',
  chapterVerseRangePrefix: 'presto_chapter_verse_range:',
} as const;

function accountId(userCode?: string): string {
  return (userCode || effectiveId() || '').trim();
}

function scoped(base: string, userCode?: string): string {
  const id = accountId(userCode);
  return id ? `${base}:${id}` : base;
}

export function readingLogStorageKey(userCode?: string): string {
  return scoped(LEGACY.readingLog, userCode);
}

export function readSecBufferStorageKey(userCode?: string): string {
  return scoped(LEGACY.secBuffer, userCode);
}

export function lastReadStorageKey(userCode?: string): string {
  return scoped(LEGACY.lastRead, userCode);
}

export function lastVerseMapStorageKey(userCode?: string): string {
  return scoped(LEGACY.lastVerse, userCode);
}

export function readEventsStorageKey(userCode?: string): string {
  return scoped(LEGACY.readEvents, userCode);
}

export function verseEventsStorageKey(userCode?: string): string {
  return scoped(LEGACY.verseEvents, userCode);
}

export function chapterVerseRangeStorageKey(
  bookId: string,
  chapter: number,
  userCode?: string,
): string {
  const id = accountId(userCode);
  const suffix = `${bookId.toUpperCase()}:${chapter}`;
  return id
    ? `${LEGACY.chapterVerseRangePrefix}${id}:${suffix}`
    : `${LEGACY.chapterVerseRangePrefix}${suffix}`;
}

export function lastVerseStorageKey(
  bookId: string,
  chapter: number,
  userCode?: string,
): string {
  const id = accountId(userCode);
  const suffix = `${bookId.toUpperCase()}:${chapter}`;
  // 旧实现挂在 last_verse 前缀下
  return id
    ? `presto_last_verse:${id}:${suffix}`
    : `presto_last_verse:${suffix}`;
}

const migratedAccounts = new Set<string>();
/** 旧版全局键只认领一次，避免同机第二账号把他人历史拷进自己的桶。 */
const LEGACY_CLAIMED_KEY = 'presto_reading_legacy_claimed';

function copyIfMissing(fromKey: string, toKey: string) {
  if (fromKey === toKey) return;
  if (localStorage.getItem(toKey) != null) return;
  const v = localStorage.getItem(fromKey);
  if (v == null || v === '') return;
  localStorage.setItem(toKey, v);
}

/**
 * 将旧版全局读经键迁入当前 user_code 桶（每账号进程内一次）。
 * 全局键仅由首个认领的账号接收；不删除旧键，避免未升级 Tab 立刻丢数据。
 */
export function migrateLegacyReadingStorageIfNeeded(userCode?: string): void {
  if (typeof window === 'undefined') return;
  const id = accountId(userCode);
  if (!id || migratedAccounts.has(id)) return;
  migratedAccounts.add(id);

  const claimed = (localStorage.getItem(LEGACY_CLAIMED_KEY) || '').trim();
  if (claimed && claimed !== id) return;

  copyIfMissing(LEGACY.readingLog, readingLogStorageKey(id));
  copyIfMissing(LEGACY.secBuffer, readSecBufferStorageKey(id));
  copyIfMissing(LEGACY.lastRead, lastReadStorageKey(id));
  copyIfMissing(LEGACY.readEvents, readEventsStorageKey(id));
  copyIfMissing(LEGACY.verseEvents, verseEventsStorageKey(id));

  // 旧 last_verse 可能是整表 JSON，也可能是 per-chapter 键
  const legacyVerseBlob = localStorage.getItem(LEGACY.lastVerse);
  if (legacyVerseBlob && localStorage.getItem(lastVerseMapStorageKey(id)) == null) {
    try {
      const parsed = JSON.parse(legacyVerseBlob);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        localStorage.setItem(lastVerseMapStorageKey(id), legacyVerseBlob);
      }
    } catch {
      /* 非整表，忽略 */
    }
  }

  // 迁移旧 per-chapter last_verse / chapter_verse_range（扫描代价可控：仅当目标空时）
  try {
    const prefixLast = 'presto_last_verse:';
    const prefixRange = LEGACY.chapterVerseRangePrefix;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(prefixLast) && !key.includes(`:${id}:`) && key !== LEGACY.lastVerse) {
        // presto_last_verse:BOOK:CH → presto_last_verse:id:BOOK:CH
        const rest = key.slice(prefixLast.length);
        if (rest.includes(':') && !/^\d{8,10}:/.test(rest)) {
          const dest = `${prefixLast}${id}:${rest}`;
          copyIfMissing(key, dest);
        }
      }
      if (key.startsWith(prefixRange) && !key.includes(`:${id}:`)) {
        const rest = key.slice(prefixRange.length);
        if (rest.includes(':') && !/^\d{8,10}:/.test(rest)) {
          const dest = `${prefixRange}${id}:${rest}`;
          copyIfMissing(key, dest);
        }
      }
    }
  } catch {
    /* ignore scan errors */
  }

  if (!claimed) localStorage.setItem(LEGACY_CLAIMED_KEY, id);
}

export function readingLsGet(baseKey: string, userCode?: string): string | null {
  migrateLegacyReadingStorageIfNeeded(userCode);
  const id = accountId(userCode);
  if (!id) return localStorage.getItem(baseKey);
  const scopedKey =
    baseKey === LEGACY.readingLog
      ? readingLogStorageKey(id)
      : baseKey === LEGACY.secBuffer
        ? readSecBufferStorageKey(id)
        : baseKey === LEGACY.lastRead
          ? lastReadStorageKey(id)
          : baseKey === LEGACY.readEvents
            ? readEventsStorageKey(id)
            : baseKey === LEGACY.verseEvents
              ? verseEventsStorageKey(id)
              : baseKey === LEGACY.lastVerse
                ? lastVerseMapStorageKey(id)
                : `${baseKey}:${id}`;
  return localStorage.getItem(scopedKey);
}

export function readingLsSet(baseKey: string, value: string, userCode?: string): void {
  migrateLegacyReadingStorageIfNeeded(userCode);
  const id = accountId(userCode);
  if (!id) {
    localStorage.setItem(baseKey, value);
    return;
  }
  const scopedKey =
    baseKey === LEGACY.readingLog
      ? readingLogStorageKey(id)
      : baseKey === LEGACY.secBuffer
        ? readSecBufferStorageKey(id)
        : baseKey === LEGACY.lastRead
          ? lastReadStorageKey(id)
          : baseKey === LEGACY.readEvents
            ? readEventsStorageKey(id)
            : baseKey === LEGACY.verseEvents
              ? verseEventsStorageKey(id)
              : baseKey === LEGACY.lastVerse
                ? lastVerseMapStorageKey(id)
                : `${baseKey}:${id}`;
  localStorage.setItem(scopedKey, value);
}
