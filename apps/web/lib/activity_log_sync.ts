/** activity_log 云同步（按日 max 合并，对齐 reading_log_sync）。 */

import type { ActivityDay } from './activity_log';
import { enqueue } from './sync';
import { mergeActivityLogDay } from './sync_contract';
import { userLsGet, userLsSet } from './user_storage';

const KEY = 'presto_activity_log';

const EMPTY_DAY = (): ActivityDay => ({
  prayers: 0,
  listen_minutes: 0,
  shelf_checkins: 0,
  shelf_posts: 0,
  visual_cards: 0,
  knowledge_steps: 0,
});

function readAll(): Record<string, ActivityDay> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(userLsGet(KEY) || '{}') as Record<string, Partial<ActivityDay>>;
    const out: Record<string, ActivityDay> = {};
    for (const [day, row] of Object.entries(raw)) {
      out[day] = {
        prayers: row.prayers ?? 0,
        listen_minutes: row.listen_minutes ?? 0,
        shelf_checkins: row.shelf_checkins ?? 0,
        shelf_posts: row.shelf_posts ?? 0,
        visual_cards: row.visual_cards ?? 0,
        knowledge_steps: row.knowledge_steps ?? 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(m: Record<string, ActivityDay>) {
  userLsSet(KEY, JSON.stringify(m));
}

function normalizeDate(date: string): string {
  const s = String(date).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

export function mergeRemoteActivityLog(
  date: string,
  remote?: Partial<ActivityDay> | null,
): ActivityDay | null {
  if (!date || !remote) return null;
  const day = normalizeDate(date);
  if (!day) return null;
  const all = readAll();
  const cur = all[day] ?? EMPTY_DAY();
  const merged = mergeActivityLogDay(cur, remote);
  if (
    merged.prayers === cur.prayers &&
    merged.listen_minutes === cur.listen_minutes &&
    merged.shelf_checkins === cur.shelf_checkins &&
    merged.shelf_posts === cur.shelf_posts &&
    merged.visual_cards === cur.visual_cards &&
    merged.knowledge_steps === cur.knowledge_steps
  ) {
    return null;
  }
  all[day] = merged;
  writeAll(all);
  return merged;
}

export function pushActivityLogDay(date: string, row: ActivityDay) {
  const day = normalizeDate(date);
  if (!day) return;
  enqueue({
    entity: 'activity_log',
    op: 'update',
    keys: { date: day },
    client_ts: new Date().toISOString(),
    data: {
      prayers: row.prayers,
      listen_minutes: row.listen_minutes,
      shelf_checkins: row.shelf_checkins,
      shelf_posts: row.shelf_posts,
      visual_cards: row.visual_cards,
      knowledge_steps: row.knowledge_steps,
    },
  });
}

export function bulkPushLocalActivityLogs() {
  for (const [date, row] of Object.entries(readAll())) {
    pushActivityLogDay(date, row);
  }
}
