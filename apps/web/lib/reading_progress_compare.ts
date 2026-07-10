import { CANON_BOOK_IDS } from './ref_label';

export interface ReadingProgressPoint {
  book: string;
  chapter: number;
  verse: number;
}

function bookIndex(book: string): number {
  return CANON_BOOK_IDS.indexOf(book.toUpperCase() as (typeof CANON_BOOK_IDS)[number]);
}

/** 同卷：章/节更大为更远；不同卷：用经卷序比较（仅当两卷均在正典表内） */
export function compareReadingProgress(
  a: ReadingProgressPoint,
  b: ReadingProgressPoint,
): number {
  const bookA = a.book.toUpperCase();
  const bookB = b.book.toUpperCase();
  if (bookA === bookB) {
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  }
  const ia = bookIndex(bookA);
  const ib = bookIndex(bookB);
  if (ia >= 0 && ib >= 0) return ia - ib;
  return 0;
}

export function isReadingProgressAhead(
  candidate: ReadingProgressPoint,
  baseline: ReadingProgressPoint,
): boolean {
  return compareReadingProgress(candidate, baseline) > 0;
}
