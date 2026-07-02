import type { BibleBook } from './api';

export type ReaderLocation = { bookId: string; chapter: number };

export function resolveChapterNav(
  books: BibleBook[],
  current: ReaderLocation,
  delta: number,
): { book: BibleBook; chapter: number } | null {
  const idx = books.findIndex((b) => b.id === current.bookId);
  if (idx < 0 || delta === 0) return null;

  let bookIdx = idx;
  let chapter = current.chapter + delta;

  if (chapter > books[bookIdx].chapter_count) {
    if (bookIdx >= books.length - 1) return null;
    bookIdx += 1;
    chapter = 1;
  } else if (chapter < 1) {
    if (bookIdx <= 0) return null;
    bookIdx -= 1;
    chapter = books[bookIdx].chapter_count;
  }

  return { book: books[bookIdx], chapter };
}

export function canNavigateChapter(
  books: BibleBook[],
  current: ReaderLocation,
  delta: number,
): boolean {
  return resolveChapterNav(books, current, delta) !== null;
}

/** 预取当前章及相邻章节（含跨卷）。 */
export function prefetchReaderVicinity(
  books: BibleBook[],
  book: BibleBook,
  chapter: number,
  mainVersionId: string | null | undefined,
  load: (bookId: string, ch: number) => void,
  radius = 2,
) {
  for (let delta = -radius; delta <= radius; delta += 1) {
    const target = resolveChapterNav(books, { bookId: book.id, chapter }, delta);
    if (!target) continue;
    load(target.book.id, target.chapter);
  }
}
