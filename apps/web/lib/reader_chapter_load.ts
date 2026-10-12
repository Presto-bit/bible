/** 读经章节正文加载（与 UI 解耦，供 ReaderView / 预取复用）。 */

import type { BibleVersion, Verse } from '@/lib/api';
import { getCachedChapter } from '@/lib/chapter_cache';
import { chapterCacheVersion, loadChapterVerses } from '@/lib/chapter_prefetch';
import { versionDisplayLabel } from '@/lib/bible_version';

export type ChapterDisplayPayload = {
  layoutVerses: Verse[];
  verses: Verse[];
  /** 主译本有结构但所选对照/英译本无经文时的提示 */
  emptyAltBanner: string | null;
};

/**
 * 结构层始终用主译本（和合本缓存键 null）；
 * 正文层：有 mainVersionId 则拉该译本，否则与结构层相同。
 */
export async function loadChapterDisplayPayload(opts: {
  bookId: string;
  chapter: number;
  mainVersionId: string | null;
  /** 已命中的当前译本缓存（可跳过一次网络） */
  cachedCurrent?: Verse[] | null;
  versions?: BibleVersion[] | null;
}): Promise<ChapterDisplayPayload | null> {
  const { bookId, chapter, mainVersionId, cachedCurrent, versions } = opts;
  const chineseVerses =
    getCachedChapter(bookId, chapter, chapterCacheVersion(null))
    ?? (await loadChapterVerses(bookId, chapter));
  if (!chineseVerses?.length) return null;

  if (!mainVersionId) {
    return {
      layoutVerses: chineseVerses,
      verses: chineseVerses,
      emptyAltBanner: null,
    };
  }

  const altVerses =
    (cachedCurrent?.length ? cachedCurrent : null)
    ?? (await loadChapterVerses(bookId, chapter, mainVersionId));

  if (!altVerses?.length) {
    const verLabel = versionDisplayLabel(mainVersionId, versions ?? undefined);
    return {
      layoutVerses: chineseVerses,
      verses: [],
      emptyAltBanner: `${verLabel} 暂无经文，请稍后刷新或换译本`,
    };
  }

  return {
    layoutVerses: chineseVerses,
    verses: altVerses,
    emptyAltBanner: null,
  };
}

export function peekCachedChapter(
  bookId: string,
  chapter: number,
  mainVersionId: string | null,
): Verse[] | null {
  const version = chapterCacheVersion(mainVersionId);
  const cached = getCachedChapter(bookId, chapter, version);
  return cached?.length ? cached : null;
}

export function peekCachedChineseChapter(bookId: string, chapter: number): Verse[] | null {
  const cached = getCachedChapter(bookId, chapter, chapterCacheVersion(null));
  return cached?.length ? cached : null;
}
