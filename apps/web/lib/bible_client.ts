/** 经文客户端：离线经包优先，在线 API 回退。 */

import { api, type BibleBook, type BibleSearchHit, type Verse } from './api';
import {
  getLocalChapter,
  listLocalBooksFromDb,
  loadBooksJson,
  searchLocalVerses,
  writeBooksLsCache,
} from './bible_local';
import { isCuvsOfflineReady, isOfflinePackReady } from './offline_pack';

export async function bibleBooks(): Promise<BibleBook[]> {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  // 在线时并行拉静态目录与 API，避免后台预加载时单一路径失败
  const [jsonBooks, remote] = await Promise.all([
    loadBooksJson(),
    offline
      ? Promise.resolve(null as { books: BibleBook[] } | null)
      : api.books().catch(() => null),
  ]);

  if (jsonBooks?.length) return jsonBooks;
  if (remote?.books?.length) {
    writeBooksLsCache(remote.books);
    return remote.books;
  }

  if (!offline) {
    const freshJson = await loadBooksJson({ fresh: true });
    if (freshJson?.length) return freshJson;
  }

  // SQLite 经包目录（可能较慢，不阻塞前两步）
  const dbBooks = await listLocalBooksFromDb();
  if (dbBooks?.length) return dbBooks;

  const retryJson = await loadBooksJson({ fresh: !offline });
  if (retryJson?.length) return retryJson;

  if (offline) {
    throw new Error('离线经包未就绪，请在「我的 → 设置」下载离线圣经');
  }
  throw new Error('无法加载经卷目录');
}

export async function bibleChapter(
  bookId: string,
  chapter: number,
  version?: string | null,
): Promise<Verse[] | null> {
  const ver = version || 'cnv';
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (ver === 'cnv' && (await isOfflinePackReady())) {
    const local = await getLocalChapter(bookId, chapter, 'cnv');
    if (local?.length) return local;
  }
  if (ver === 'cuvs' && (await isCuvsOfflineReady())) {
    const local = await getLocalChapter(bookId, chapter, 'cuvs');
    if (local?.length) return local;
  }

  if (offline) {
    const local = await getLocalChapter(
      bookId,
      chapter,
      ver === 'cuvs' ? 'cuvs' : 'cnv',
    );
    if (local?.length) return local;
    return null;
  }

  try {
    const data = version
      ? await api.chapter(bookId, chapter, version)
      : await api.chapter(bookId, chapter);
    return data.verses;
  } catch {
    if (ver === 'cnv') {
      const local = await getLocalChapter(bookId, chapter, 'cnv');
      if (local?.length) return local;
    }
    if (ver === 'cuvs') {
      const local = await getLocalChapter(bookId, chapter, 'cuvs');
      if (local?.length) return local;
    }
    return null;
  }
}

export async function bibleSearch(
  q: string,
  opts?: { version?: string | null; testament?: 'OT' | 'NT' | null },
): Promise<BibleSearchHit[]> {
  const version = opts?.version || undefined;
  const testament = opts?.testament || undefined;
  const canUseLocal = (!version || version === 'cnv') && !testament;
  if (canUseLocal && (await isOfflinePackReady())) {
    const local = await searchLocalVerses(q);
    if (local) {
      return local.map((h) => ({
        ...h,
        ref: `${h.name}${h.chapter}:${h.verse}`,
        osis: `${h.book}.${h.chapter}.${h.verse}`,
        version: 'cnv',
      }));
    }
  }
  try {
    const remote = await api.search(q, { version, testament: testament ?? undefined });
    return remote.hits;
  } catch {
    if (!canUseLocal) return [];
    const local = await searchLocalVerses(q);
    return (local ?? []).map((h) => ({
      ...h,
      ref: `${h.name}${h.chapter}:${h.verse}`,
      osis: `${h.book}.${h.chapter}.${h.verse}`,
      version: 'cnv',
    }));
  }
}
