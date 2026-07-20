export interface ReadingProgressPoint {
  book: string;
  chapter: number;
  verse: number;
}

/**
 * 同卷：章/节更大为更远。
 * 跨卷：不可比（返回 0）——「当前读到哪」不能用正典卷序判定新旧。
 */
export function compareReadingProgress(
  a: ReadingProgressPoint,
  b: ReadingProgressPoint,
): number {
  const bookA = a.book.toUpperCase();
  const bookB = b.book.toUpperCase();
  if (bookA !== bookB) return 0;
  if (a.chapter !== b.chapter) return a.chapter - b.chapter;
  return a.verse - b.verse;
}

export function isReadingProgressAhead(
  candidate: ReadingProgressPoint,
  baseline: ReadingProgressPoint,
): boolean {
  return compareReadingProgress(candidate, baseline) > 0;
}

/** 同卷且 candidate 在章/节上更靠后 */
export function isSameBookAhead(
  candidate: ReadingProgressPoint,
  baseline: ReadingProgressPoint,
): boolean {
  if (candidate.book.toUpperCase() !== baseline.book.toUpperCase()) return false;
  return isReadingProgressAhead(candidate, baseline);
}
