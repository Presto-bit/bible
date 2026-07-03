import { enqueue } from './sync';
import { getLastRead, setLastRead, type LastRead } from './reading';

export function pushReadingProgress(local?: LastRead | null) {
  const lr = local ?? getLastRead();
  if (!lr) return;
  enqueue({
    entity: 'reading_progress',
    op: 'update',
    data: { book: lr.bookId, chapter: lr.chapter, verse: null },
    client_ts: new Date().toISOString(),
  });
}

export function applyRemoteReadingProgress(data?: {
  book?: string | null;
  chapter?: number | null;
  verse?: number | null;
} | null) {
  if (!data?.book || !data.chapter) return;
  const local = getLastRead();
  if (local && local.bookId === data.book && local.chapter === data.chapter) return;
  setLastRead(data.book, data.chapter);
}
