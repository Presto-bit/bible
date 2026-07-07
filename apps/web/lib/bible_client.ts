/** 经文客户端：离线经包优先，在线 API 回退。 */

import { api, type BibleBook, type BibleSearchHit, type Verse } from './api';
import {
  getLocalChapter,
  listLocalBooksFromDb,
  loadBooksJson,
  searchLocalVerses,
  seededBooks,
  writeBooksLsCache,
} from './bible_local';
import { isCuvsOfflineReady, isKjvOfflineReady, isOfflinePackReady } from './offline_pack';

export async function bibleBooks(): Promise<BibleBook[]> {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  // 始终尝试 API（PWA 下 navigator.onLine 可能短暂误报离线）
  const [jsonBooks, remote] = await Promise.all([
    loadBooksJson(),
    api.books().catch(() => null),
  ]);

  if (jsonBooks?.length) return jsonBooks;
  if (remote?.books?.length) {
    writeBooksLsCache(remote.books);
    return remote.books;
  }

  const freshJson = await loadBooksJson({ fresh: true });
  if (freshJson?.length) return freshJson;

  // 在线时不走 SQLite/sql.js，避免经包半下载或 wasm 失败拖垮目录
  if (!offline) {
    const seed = seededBooks();
    if (seed.length) return seed;
  }

  const dbBooks = await listLocalBooksFromDb();
  if (dbBooks?.length) return dbBooks;

  const retryJson = await loadBooksJson({ fresh: true });
  if (retryJson?.length) return retryJson;

  const seed = seededBooks();
  if (seed.length) return seed;

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

  const tryLocal = async (translation: 'cnv' | 'cuvs' | 'kjv') => {
    try {
      return await getLocalChapter(bookId, chapter, translation);
    } catch {
      return null;
    }
  };

  if (ver === 'cnv' && (await isOfflinePackReady())) {
    const local = await tryLocal('cnv');
    if (local?.length) return local;
  }
  if (ver === 'cuvs' && (await isCuvsOfflineReady())) {
    const local = await tryLocal('cuvs');
    if (local?.length) return local;
  }
  if (ver === 'kjv' && (await isKjvOfflineReady())) {
    const local = await tryLocal('kjv');
    if (local?.length) return local;
  }

  if (offline) {
    const local = await tryLocal(
      ver === 'cuvs' ? 'cuvs' : ver === 'kjv' ? 'kjv' : 'cnv',
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
      const local = await tryLocal('cnv');
      if (local?.length) return local;
    }
    if (ver === 'cuvs') {
      const local = await tryLocal('cuvs');
      if (local?.length) return local;
    }
    if (ver === 'kjv') {
      const local = await tryLocal('kjv');
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
  const localTranslation =
    version === 'kjv' ? 'kjv' : version === 'cuvs' ? 'cuvs' : 'cnv';
  const canUseLocal =
    (!version || version === 'cnv' || version === 'kjv') && !testament;
  const localReady =
    localTranslation === 'kjv'
      ? await isKjvOfflineReady()
      : localTranslation === 'cuvs'
        ? await isCuvsOfflineReady()
        : await isOfflinePackReady();
  if (canUseLocal && localReady) {
    const local = await searchLocalVerses(q, 24, localTranslation);
    if (local) {
      return local.map((h) => ({
        ...h,
        ref: `${h.name}${h.chapter}:${h.verse}`,
        osis: `${h.book}.${h.chapter}.${h.verse}`,
        version: localTranslation,
      }));
    }
  }
  try {
    const remote = await api.search(q, { version, testament: testament ?? undefined });
    return remote.hits;
  } catch {
    if (!canUseLocal) return [];
    const local = await searchLocalVerses(q, 24, localTranslation);
    return (local ?? []).map((h) => ({
      ...h,
      ref: `${h.name}${h.chapter}:${h.verse}`,
      osis: `${h.book}.${h.chapter}.${h.verse}`,
      version: localTranslation,
    }));
  }
}
