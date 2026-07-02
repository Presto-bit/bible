import { bibleChapter } from './bible_client';
import type { Verse } from './api';
import { getCachedChapter, setCachedChapter } from './chapter_cache';

export function chapterCacheVersion(mainVersionId: string | null | undefined): string {
  return mainVersionId || 'cnv';
}

/** 读本地经包 / 章节缓存 / 在线 API。 */
export async function loadChapterVerses(
  bookId: string,
  chapter: number,
  mainVersionId?: string | null,
): Promise<Verse[] | null> {
  if (chapter < 1) return null;
  const version = chapterCacheVersion(mainVersionId);
  const cached = getCachedChapter(bookId, chapter, version);
  if (cached?.length) return cached;
  const verses = await bibleChapter(bookId, chapter, mainVersionId);
  if (verses?.length) {
    setCachedChapter(bookId, chapter, verses, version);
    return verses;
  }
  return null;
}

export function prefetchAdjacentChapters(
  bookId: string,
  centerChapter: number,
  chapterCount: number,
  mainVersionId?: string | null,
  radius = 2,
) {
  for (let delta = -radius; delta <= radius; delta += 1) {
    if (delta === 0) continue;
    const ch = centerChapter + delta;
    if (ch < 1 || ch > chapterCount) continue;
    void loadChapterVerses(bookId, ch, mainVersionId);
  }
}

export function getChapterVersesSync(
  bookId: string,
  chapter: number,
  mainVersionId?: string | null,
): Verse[] | null {
  if (chapter < 1) return null;
  const version = chapterCacheVersion(mainVersionId);
  return getCachedChapter(bookId, chapter, version);
}
