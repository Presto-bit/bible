import { enqueue } from './sync';
import { readEventSyncId, READ_EVENT_DEDUPE_MS } from './sync_contract';
import type { ReadEvent } from './reading';
import { readEvents } from './reading';
import {
  migrateLegacyReadingStorageIfNeeded,
  readEventsStorageKey,
} from './reading_storage';

export function mergeRemoteReadEvent(data?: {
  id?: string;
  ts?: number;
  book?: string;
  chapter?: number;
} | null): boolean {
  if (!data?.book || !data.chapter || !data.ts) return false;
  const book = data.book.toUpperCase();
  const chapter = data.chapter;
  const ts = data.ts;
  const events = readEvents();
  const id = data.id || readEventSyncId(book, chapter, ts);
  if (events.some((e) => readEventSyncId(e.book, e.chapter, e.ts) === id)) return false;
  const recent = events.find(
    (e) => e.book === book && e.chapter === chapter && Math.abs(e.ts - ts) < READ_EVENT_DEDUPE_MS,
  );
  if (recent) return false;
  events.push({ ts, book, chapter });
  const trimmed = events.slice(-2000);
  migrateLegacyReadingStorageIfNeeded();
  localStorage.setItem(readEventsStorageKey(), JSON.stringify(trimmed));
  return true;
}

export function pushReadEvent(event: ReadEvent) {
  const book = event.book.toUpperCase();
  const id = readEventSyncId(book, event.chapter, event.ts);
  enqueue({
    entity: 'read_event',
    op: 'update',
    id,
    version: 1,
    client_ts: new Date(event.ts).toISOString(),
    data: { ts: event.ts, book, chapter: event.chapter },
  });
}

export function bulkPushLocalReadEvents() {
  for (const e of readEvents()) {
    pushReadEvent(e);
  }
}
