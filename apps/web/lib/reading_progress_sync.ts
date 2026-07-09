import { enqueue } from './sync';
import {
  getLastRead,
  getLastReadVerse,
  setLastRead,
  setLastReadVerse,
  type LastRead,
} from './reading';

const REMOTE_TS_KEY = 'presto_reading_progress_remote_ts';

function remoteTs(): number {
  return Number(localStorage.getItem(REMOTE_TS_KEY) || '0');
}

function setRemoteTs(ms: number) {
  localStorage.setItem(REMOTE_TS_KEY, String(ms));
}

export function pushReadingProgress(local?: LastRead | null) {
  const lr = local ?? getLastRead();
  if (!lr) return;
  const verse = getLastReadVerse(lr.bookId, lr.chapter) ?? 1;
  enqueue({
    entity: 'reading_progress',
    op: 'update',
    data: { book: lr.bookId, chapter: lr.chapter, verse },
    client_ts: new Date().toISOString(),
  });
}

export function applyRemoteReadingProgress(
  data?: {
    book?: string | null;
    chapter?: number | null;
    verse?: number | null;
  } | null,
  updatedAt?: string | null,
) {
  if (!data?.book || !data.chapter) return;
  const remoteMs = updatedAt ? Date.parse(updatedAt) : Date.now();
  const local = getLastRead();
  const localVerse = local
    ? getLastReadVerse(local.bookId, local.chapter) ?? 1
    : 1;
  const remoteVerse = data.verse ?? 1;

  const shouldApply = (() => {
    if (!local) return true;
    if (local.bookId !== data.book) return remoteMs >= remoteTs();
    if (local.chapter !== data.chapter) return data.chapter > local.chapter || remoteMs >= remoteTs();
    return remoteVerse > localVerse || remoteMs >= remoteTs();
  })();

  if (!shouldApply) return;
  setRemoteTs(remoteMs);
  setLastRead(data.book, data.chapter, { skipSync: true });
  if (remoteVerse > 1) {
    setLastReadVerse(data.book, data.chapter, remoteVerse);
  }
}
