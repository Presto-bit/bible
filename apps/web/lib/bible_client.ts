/** 经文客户端：离线经包优先，在线 API 回退。 */

import { api, type BibleBook, type BibleSearchHit, type Verse } from './api';
import {
  getLocalChapter,
  listLocalBooks,
  searchLocalVerses,
} from './bible_local';
import { isCuvsOfflineReady, isOfflinePackReady } from './offline_pack';

export async function bibleBooks(): Promise<BibleBook[]> {
  const local = await listLocalBooks();
  if (local?.length) return local;
  try {
    const remote = await api.books();
    return remote.books;
  } catch {
    const fallback = await listLocalBooks();
    if (fallback?.length) return fallback;
    throw new Error('无法加载经卷目录');
  }
}

export async function bibleChapter(
  bookId: string,
  chapter: number,
  version?: string | null,
): Promise<Verse[] | null> {
  const ver = version || 'cnv';
  if (ver === 'cnv' && (await isOfflinePackReady())) {
    const local = await getLocalChapter(bookId, chapter, 'cnv');
    if (local?.length) return local;
  }
  if (ver === 'cuvs' && (await isCuvsOfflineReady())) {
    const local = await getLocalChapter(bookId, chapter, 'cuvs');
    if (local?.length) return local;
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

export async function bibleSearch(q: string): Promise<BibleSearchHit[]> {
  if (await isOfflinePackReady()) {
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
    const remote = await api.search(q);
    return remote.hits;
  } catch {
    const local = await searchLocalVerses(q);
    return (local ?? []).map((h) => ({
      ...h,
      ref: `${h.name}${h.chapter}:${h.verse}`,
      osis: `${h.book}.${h.chapter}.${h.verse}`,
      version: 'cnv',
    }));
  }
}
