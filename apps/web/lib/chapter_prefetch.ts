import { api, type Verse } from './api';
import { getCachedChapter, setCachedChapter } from './chapter_cache';

export function chapterCacheVersion(mainVersionId: string | null | undefined): string {
  return mainVersionId || 'cnv';
}

/** 读缓存或拉取一章经文，并写入本地缓存。 */
export async function loadChapterVerses(
  bookId: string,
  chapter: number,
  mainVersionId?: string | null,
): Promise<Verse[] | null> {
  if (chapter < 1) return null;
  const version = chapterCacheVersion(mainVersionId);
  const cached = getCachedChapter(bookId, chapter, version);
  if (cached?.length) return cached;
  try {
    const data = mainVersionId
      ? await api.chapter(bookId, chapter, mainVersionId)
      : await api.chapter(bookId, chapter);
    setCachedChapter(bookId, chapter, data.verses, version);
    return data.verses;
  } catch {
    return null;
  }
}

/** 后台预取相邻章节，减少跟手翻页后的等待。 */
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

/** 同步读缓存（翻页瞬间灌入，不发起网络）。 */
export function getChapterVersesSync(
  bookId: string,
  chapter: number,
  mainVersionId?: string | null,
): Verse[] | null {
  if (chapter < 1) return null;
  const version = chapterCacheVersion(mainVersionId);
  return getCachedChapter(bookId, chapter, version);
}
