import { enqueue } from './sync';
import {
  getLastRead,
  getLastReadVerse,
  setLastRead,
  setLastReadVerse,
  type LastRead,
} from './reading';
import {
  getReadingProgressRemoteTs,
  setReadingProgressRemoteTs,
} from './sync_account';
import {
  compareReadingProgress,
  isReadingProgressAhead,
  type ReadingProgressPoint,
} from './reading_progress_compare';

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
  const remoteVerse = data.verse ?? 1;
  const remotePoint: ReadingProgressPoint = {
    book: data.book,
    chapter: data.chapter,
    verse: remoteVerse,
  };

  const shouldApply = (() => {
    if (!local) return true;
    const localVerse = getLastReadVerse(local.bookId, local.chapter) ?? 1;
    const localPoint: ReadingProgressPoint = {
      book: local.bookId,
      chapter: local.chapter,
      verse: localVerse,
    };
    const cmp = compareReadingProgress(remotePoint, localPoint);
    if (cmp > 0) return true;
    if (cmp < 0) return false;
    if (local.bookId.toUpperCase() === data.book.toUpperCase()) return false;
    return remoteMs >= getReadingProgressRemoteTs();
  })();

  if (!shouldApply) return;
  setReadingProgressRemoteTs(remoteMs);
  setLastRead(data.book, data.chapter, { skipSync: true });
  if (remoteVerse > 1) {
    setLastReadVerse(data.book, data.chapter, remoteVerse);
  }
}

export function mergeReadingProgressPoints(
  local: ReadingProgressPoint | null,
  remote: ReadingProgressPoint | null,
): ReadingProgressPoint | null {
  if (!local) return remote;
  if (!remote) return local;
  if (isReadingProgressAhead(remote, local)) return remote;
  if (isReadingProgressAhead(local, remote)) return local;
  return local;
}
