/** 经文客户端：本地目录优先秒开；在线 API 后台刷新。离线或 API 失败再走本地 sql.js。 */

import type { BibleBook, Verse } from './api_core';
import { bibleApi, type BibleSearchHit } from './api/bible';
import {
  getLocalChapter,
  listLocalBooksFromDb,
  loadBooksJson,
  searchLocalVerses,
  scheduleReleaseLocalBibleDb,
  seededBooks,
  writeBooksLsCache,
} from './bible_local';
import { isCuvsOfflineReady, isKjvOfflineReady, isContemporaryOfflineReady, isOfflinePackReady } from './offline_pack';

function refreshBooksFromApi() {
  void bibleApi
    .books()
    .then((remote) => {
      if (remote?.books?.length) writeBooksLsCache(remote.books);
    })
    .catch(() => {});
}

export async function bibleBooks(): Promise<BibleBook[]> {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  // 本地优先：mem / LS / seed / books.json，绝不被 API 拖住首屏
  const jsonBooks = await loadBooksJson();
  if (jsonBooks?.length) {
    if (!offline) refreshBooksFromApi();
    return jsonBooks;
  }

  const seed = seededBooks();
  if (seed.length) {
    if (!offline) refreshBooksFromApi();
    return seed;
  }

  const remote = await bibleApi.books().catch(() => null);
  if (remote?.books?.length) {
    writeBooksLsCache(remote.books);
    return remote.books;
  }

  const freshJson = await loadBooksJson({ fresh: true });
  if (freshJson?.length) return freshJson;

  // 在线时不走 SQLite/sql.js，避免经包半下载或 wasm 失败拖垮目录
  if (!offline) {
    const again = seededBooks();
    if (again.length) return again;
  }

  const dbBooks = await listLocalBooksFromDb();
  if (dbBooks?.length) return dbBooks;

  const retryJson = await loadBooksJson({ fresh: true });
  if (retryJson?.length) return retryJson;

  const lastSeed = seededBooks();
  if (lastSeed.length) return lastSeed;

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
  const ver = version || 'cuvs';
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  const tryLocal = async (translation: 'cnv' | 'cuvs' | 'kjv' | 'contemporary') => {
    try {
      return await getLocalChapter(bookId, chapter, translation);
    } catch {
      return null;
    }
  };

  const translation: 'cnv' | 'cuvs' | 'kjv' | 'contemporary' | null =
    ver === 'cnv'
      ? 'cnv'
      : ver === 'kjv'
        ? 'kjv'
        : ver === 'contemporary'
          ? 'contemporary'
          : ver === 'cuvs'
            ? 'cuvs'
            : null;

  // 在线：优先 API，避免进阅读器时 sql.js 整库进内存尖刺
  if (!offline) {
    try {
      const data = version
        ? await bibleApi.chapter(bookId, chapter, version)
        : await bibleApi.chapter(bookId, chapter);
      return data.verses;
    } catch {
      if (!translation) return null;
      const local = await tryLocal(translation);
      if (local?.length) return local;
      return null;
    }
  }

  if (translation === 'cuvs' && (await isCuvsOfflineReady())) {
    const local = await tryLocal('cuvs');
    if (local?.length) return local;
  }
  if (translation === 'cnv' && (await isOfflinePackReady())) {
    const local = await tryLocal('cnv');
    if (local?.length) return local;
  }
  if (translation === 'kjv' && (await isKjvOfflineReady())) {
    const local = await tryLocal('kjv');
    if (local?.length) return local;
  }
  if (translation === 'contemporary' && (await isContemporaryOfflineReady())) {
    const local = await tryLocal('contemporary');
    if (local?.length) return local;
  }

  if (!translation) return null;
  const local = await tryLocal(translation);
  return local?.length ? local : null;
}

export type BibleSearchPage = {
  hits: BibleSearchHit[];
  total: number;
  totalOt: number;
  totalNt: number;
  hasMore: boolean;
};

export async function bibleSearch(
  q: string,
  opts?: {
    version?: string | null;
    testament?: 'OT' | 'NT' | null;
    limit?: number;
    offset?: number;
  },
): Promise<BibleSearchPage> {
  const version = opts?.version || undefined;
  const testament = opts?.testament || undefined;
  const limit = opts?.limit ?? 40;
  const offset = opts?.offset ?? 0;
  const localTranslation =
    version === 'kjv'
      ? 'kjv'
      : version === 'cnv'
        ? 'cnv'
        : version === 'contemporary'
          ? 'contemporary'
          : 'cuvs';
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  const fromRemote = async (): Promise<BibleSearchPage> => {
    const remote = await bibleApi.search(q, {
      version,
      testament: testament ?? undefined,
      limit,
      offset,
    });
    return {
      hits: remote.hits,
      total: remote.total ?? remote.hits.length,
      totalOt: remote.total_ot ?? 0,
      totalNt: remote.total_nt ?? 0,
      hasMore: Boolean(remote.has_more),
    };
  };

  // 在线优先 API，避免搜索路径误开 sql.js
  if (!offline) {
    try {
      return await fromRemote();
    } catch {
      /* fall through to local */
    }
  }

  const localReady =
    localTranslation === 'kjv'
      ? await isKjvOfflineReady()
      : localTranslation === 'contemporary'
        ? await isContemporaryOfflineReady()
      : localTranslation === 'cuvs'
        ? await isCuvsOfflineReady()
        : await isOfflinePackReady();
  if (localReady) {
    const local = await searchLocalVerses(q, limit, localTranslation, {
      testament,
      offset,
    });
    if (local) {
      const hits = local.map((h) => ({
        ...h,
        ref: `${h.name}${h.chapter}:${h.verse}`,
        osis: `${h.book}.${h.chapter}.${h.verse}`,
        version: localTranslation,
      }));
      // 搜完空闲释放整库，避免长期占 ~10MB+ 内存
      scheduleReleaseLocalBibleDb();
      // 离线无总数：用本页是否满页粗估 hasMore
      return {
        hits,
        total: offset + hits.length + (hits.length >= limit ? 1 : 0),
        totalOt: 0,
        totalNt: 0,
        hasMore: hits.length >= limit,
      };
    }
  }
  if (offline) {
    return { hits: [], total: 0, totalOt: 0, totalNt: 0, hasMore: false };
  }
  try {
    return await fromRemote();
  } catch {
    return { hits: [], total: 0, totalOt: 0, totalNt: 0, hasMore: false };
  }
}
