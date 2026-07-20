import { enqueue } from './sync';
import {
  getLastRead,
  getLastReadVerse,
  setLastRead,
  setLastReadVerse,
  type LastRead,
} from './reading';
import {
  getReadingProgressLocalTs,
  getReadingProgressRemoteTs,
  setReadingProgressLocalTs,
  setReadingProgressRemoteTs,
} from './sync_account';
import {
  isSameBookAhead,
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

/**
 * 拉取云端阅读进度：对齐 Mobile——
 * 同卷且远程更靠后 → 采用；否则仅当远程时间戳更新才覆盖。
 * 禁止用正典卷序把罗马书盖过创世记这类「当前书签」。
 */
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
  if (!Number.isFinite(remoteMs)) return;
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
    if (isSameBookAhead(remotePoint, localPoint)) return true;
    const localTs = Math.max(getReadingProgressLocalTs(), getReadingProgressRemoteTs());
    return remoteMs > localTs;
  })();

  if (!shouldApply) return;
  setReadingProgressRemoteTs(remoteMs);
  setLastRead(data.book, data.chapter, { skipSync: true, updatedAtMs: remoteMs });
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
  if (isSameBookAhead(remote, local)) return remote;
  if (isSameBookAhead(local, remote)) return local;
  // 跨卷不可比：保留本地书签，避免正典序误覆盖
  return local;
}
