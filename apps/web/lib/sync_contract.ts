/** 多端同步契约（与 shared/sync_contract.json、mobile sync_contract.dart 对齐） */

import contract from '../../../shared/sync_contract.json';

export const SYNC_CONTRACT_VERSION = contract.version as number;

export const SYNC_PULL_ENTITIES = contract.entities as string[];

export type DayLogMerge = { minutes: number; chapters: number };

export type ActivityDayMerge = {
  prayers: number;
  listen_minutes: number;
  shelf_checkins: number;
  shelf_posts: number;
  visual_cards: number;
  knowledge_steps: number;
};

/** reading_log：按日取 minutes/chapters 较大值 */
export function mergeReadingLogDay(a: DayLogMerge, b: DayLogMerge): DayLogMerge {
  return {
    minutes: Math.max(a.minutes || 0, b.minutes || 0),
    chapters: Math.max(a.chapters || 0, b.chapters || 0),
  };
}

/** activity_log：按日各计数取较大值 */
export function mergeActivityLogDay(
  a: ActivityDayMerge,
  b: Partial<ActivityDayMerge>,
): ActivityDayMerge {
  return {
    prayers: Math.max(a.prayers || 0, b.prayers || 0),
    listen_minutes: Math.max(a.listen_minutes || 0, b.listen_minutes || 0),
    shelf_checkins: Math.max(a.shelf_checkins || 0, b.shelf_checkins || 0),
    shelf_posts: Math.max(a.shelf_posts || 0, b.shelf_posts || 0),
    visual_cards: Math.max(a.visual_cards || 0, b.visual_cards || 0),
    knowledge_steps: Math.max(a.knowledge_steps || 0, b.knowledge_steps || 0),
  };
}

/** read_event：每用户每天每卷每章至多一条（跨端去重） */
export function readEventSyncId(book: string, chapter: number, ts: number): string {
  const d = new Date(ts);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${ymd}:${book.toUpperCase()}:${chapter}`;
}

export const READ_EVENT_DEDUPE_MS = 30 * 60 * 1000;
