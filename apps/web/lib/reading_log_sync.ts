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

export function mergeRemoteReadingLog(
  date: string,
  remote?: { minutes?: number; chapters?: number } | null,
): DayLog | null {
  if (!date || !remote) return null;
  const logs = readAll();
  const cur = logs[date] || { minutes: 0, chapters: 0 };
  const merged = mergeReadingLogDay(cur, {
    minutes: remote.minutes ?? 0,
    chapters: remote.chapters ?? 0,
  });
  if (merged.minutes === cur.minutes && merged.chapters === cur.chapters) return null;
  logs[date] = merged;
  writeAll(logs);
  return merged;
}

export function pushReadingLog(date: string, log: DayLog) {
  if (!date) return;
  enqueue({
    entity: 'reading_log',
    op: 'update',
    keys: { date },
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
