/** 多端同步契约（与 shared/sync_contract.json、mobile sync_contract.dart 对齐） */

import contract from '../../../shared/sync_contract.json';

export const SYNC_CONTRACT_VERSION = contract.version as number;

export const SYNC_PULL_ENTITIES = contract.entities as string[];

export type DayLogMerge = { minutes: number; chapters: number };

/** reading_log：按日取 minutes/chapters 较大值 */
export function mergeReadingLogDay(a: DayLogMerge, b: DayLogMerge): DayLogMerge {
  return {
    minutes: Math.max(a.minutes || 0, b.minutes || 0),
    chapters: Math.max(a.chapters || 0, b.chapters || 0),
  };
}

/** read_event：每用户每天每卷每章至多一条（跨端去重） */
export function readEventSyncId(book: string, chapter: number, ts: number): string {
  const d = new Date(ts);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${ymd}:${book.toUpperCase()}:${chapter}`;
}

export const READ_EVENT_DEDUPE_MS = 30 * 60 * 1000;
