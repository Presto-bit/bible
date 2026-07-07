import type { Verse } from './api';
import {
  getChapterVersesSync,
  loadChapterVerses,
} from './chapter_prefetch';
import { outlineFor, outlineForAsync } from './section_titles';
import type { SectionMark } from './section_titles';

export type ChapterReaderBundle = {
  verses: Verse[];
  layoutVerses: Verse[];
  outline: SectionMark[];
  /** 对照阅读次列（与主阅读器 parallel 模式一致） */
  parallelVerses: Verse[] | null;
};

export type ChapterBundleOptions = {
  mainVersionId?: string | null;
  /** 对照模式且非单译本主显示时，预载次列经文 */
  parallelVer?: string | null;
};

/** 一次性加载预览/翻页所需的完整章节包，避免分段 hydrate 造成排版跳动。 */
export async function loadChapterReaderBundle(
  bookId: string,
  chapter: number,
  opts: ChapterBundleOptions = {},
): Promise<ChapterReaderBundle | null> {
  if (chapter < 1) return null;
  const { mainVersionId, parallelVer } = opts;

  const versesP = loadChapterVerses(bookId, chapter, mainVersionId);
  const layoutP = mainVersionId
    ? loadChapterVerses(bookId, chapter, null)
    : versesP;
  const outlineP = outlineForAsync(bookId, chapter);
  const parallelP =
    parallelVer && !mainVersionId
      ? loadChapterVerses(bookId, chapter, parallelVer)
      : Promise.resolve(null);

  const [verses, layoutVerses, outline, parallelVerses] = await Promise.all([
    versesP,
    layoutP,
    outlineP,
    parallelP,
  ]);

  if (!verses?.length) return null;

  return {
    verses,
    layoutVerses: layoutVerses?.length ? layoutVerses : verses,
    outline: outline ?? [],
    parallelVerses: parallelVerses?.length ? parallelVerses : null,
  };
}

/** 缓存齐备时同步取包（用于零延迟预览）；缺任一经文层则返回 null。 */
export function getChapterReaderBundleSync(
  bookId: string,
  chapter: number,
  opts: ChapterBundleOptions = {},
): ChapterReaderBundle | null {
  if (chapter < 1) return null;
  const { mainVersionId, parallelVer } = opts;

  const verses = getChapterVersesSync(bookId, chapter, mainVersionId);
  if (!verses?.length) return null;

  let layoutVerses = verses;
  if (mainVersionId) {
    const cn = getChapterVersesSync(bookId, chapter, null);
    if (!cn?.length) return null;
    layoutVerses = cn;
  }

  let parallelVerses: Verse[] | null = null;
  if (parallelVer && !mainVersionId) {
    parallelVerses = getChapterVersesSync(bookId, chapter, parallelVer);
    if (!parallelVerses?.length) return null;
  }

  return {
    verses,
    layoutVerses,
    outline: outlineFor(bookId, chapter),
    parallelVerses,
  };
}

export function prefetchChapterReaderBundle(
  bookId: string,
  chapter: number,
  opts: ChapterBundleOptions = {},
): void {
  if (chapter < 1) return;
  void loadChapterReaderBundle(bookId, chapter, opts);
  if (opts.mainVersionId) {
    void loadChapterVerses(bookId, chapter, null);
    void loadChapterVerses(bookId, chapter, opts.mainVersionId);
  }
  if (opts.parallelVer && !opts.mainVersionId) {
    void loadChapterVerses(bookId, chapter, opts.parallelVer);
  }
}

/** 邻章优先：先 ±1 完整包，再 ±radius 经文缓存。 */
export function prefetchReaderVicinityBundles<T extends { id: string; chapter_count: number }>(
  books: T[],
  book: T,
  chapter: number,
  opts: ChapterBundleOptions,
  resolveNav: (
    books: T[],
    loc: { bookId: string; chapter: number },
    delta: number,
  ) => { book: { id: string }; chapter: number } | null,
  radius = 2,
): void {
  const loc = { bookId: book.id, chapter };
  for (const delta of [-1, 1]) {
    const target = resolveNav(books, loc, delta);
    if (target) prefetchChapterReaderBundle(target.book.id, target.chapter, opts);
  }
  for (let delta = -radius; delta <= radius; delta += 1) {
    if (delta === 0 || Math.abs(delta) === 1) continue;
    const target = resolveNav(books, loc, delta);
    if (!target) continue;
    void loadChapterVerses(target.book.id, target.chapter, opts.mainVersionId);
    if (opts.mainVersionId) {
      void loadChapterVerses(target.book.id, target.chapter, null);
    }
    if (opts.parallelVer && !opts.mainVersionId) {
      void loadChapterVerses(target.book.id, target.chapter, opts.parallelVer);
    }
  }
}
