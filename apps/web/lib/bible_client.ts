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
  // 1. 静态 books.json（SW 预缓存，最快）
  const jsonBooks = await loadBooksJson();
  if (jsonBooks?.length) return jsonBooks;

  // 2. 在线 API
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (!offline) {
    try {
      const remote = await api.books();
      if (remote.books?.length) {
        writeBooksLsCache(remote.books);
        return remote.books;
      }
    } catch {
      /* 走本地回退 */
    }
  }

  // 3. SQLite 经包目录（可能较慢，不阻塞前两步）
  const dbBooks = await listLocalBooksFromDb();
  if (dbBooks?.length) return dbBooks;

  // 4. 再试一次静态目录
  const retryJson = await loadBooksJson();
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
