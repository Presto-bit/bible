import { enqueue } from './sync';
import { mergeReadingLogDay } from './sync_contract';

export type DayLog = { minutes: number; chapters: number };

const LOG_KEY = 'presto_reading_log';

function readAll(): Record<string, DayLog> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '{}') as Record<string, DayLog>;
  } catch {
    return {};
  }
}

function writeAll(logs: Record<string, DayLog>) {
  localStorage.setItem(LOG_KEY, JSON.stringify(logs));
}

/** 云端 DATE 可能序列化为 YYYY-MM-DD 或带时间的 ISO */
function normalizeLogDate(date: string): string {
  const s = String(date).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

export function mergeRemoteReadingLog(
  date: string,
  remote?: { minutes?: number; chapters?: number } | null,
): DayLog | null {
  if (!date || !remote) return null;
  const day = normalizeLogDate(date);
  if (!day) return null;
  const logs = readAll();
  const cur = logs[day] || { minutes: 0, chapters: 0 };
  const merged = mergeReadingLogDay(cur, {
    minutes: remote.minutes ?? 0,
    chapters: remote.chapters ?? 0,
  });
  if (merged.minutes === cur.minutes && merged.chapters === cur.chapters) return null;
  logs[day] = merged;
  writeAll(logs);
  void import('./reading_durable').then((m) => m.scheduleReadingSnapshotBackup());
  return merged;
}

export function pushReadingLog(date: string, log: DayLog) {
  const day = normalizeLogDate(date);
  if (!day) return;
  enqueue({
    entity: 'reading_log',
    op: 'update',
    keys: { date: day },
    client_ts: new Date().toISOString(),
    data: { minutes: log.minutes, chapters: log.chapters },
  });
}

/** 将本地全部 reading_log 入队（首次迁移） */
export function bulkPushLocalReadingLogs() {
  const logs = readAll();
  for (const [date, log] of Object.entries(logs)) {
    pushReadingLog(date, log);
  }
}
