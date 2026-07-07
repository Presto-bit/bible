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

  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (offline) {
    throw new Error('离线经包未就绪，请在「我的 → 设置」下载离线圣经');
  }

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

export async function bibleSearch(
  q: string,
  opts?: { version?: string | null; testament?: 'OT' | 'NT' | null },
): Promise<BibleSearchHit[]> {
  const version = opts?.version || undefined;
  const testament = opts?.testament || undefined;
  // 本地离线包目前仅 CNV，且无法按译本切换时走在线
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
