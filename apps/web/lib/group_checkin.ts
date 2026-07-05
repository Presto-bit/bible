/** 打卡快捷感想 chips（PRODUCT §5.4.3） */
import { getChapterVerseRange, todayChaptersInBook } from './reading';

export const GROUP_CHECKIN_CHIPS = [
  '很受触动 🙏',
  '为家人祷告',
  '愿与弟兄共勉',
  '完成今日打卡 ✓',
] as const;

export const GROUP_CHECKIN_DEFAULT_BODY = '完成今日打卡 ✓';

export function chapterRef(bookId: string, chapter: number, verse?: number): string {
  if (verse && verse > 0) return `${bookId}.${chapter}.${verse}`;
  return `${bookId}.${chapter}`;
}

/** 经节范围 ref，如 GEN.1.1-3；单节则 GEN.1.3。 */
export function verseRangeRef(
  bookId: string,
  chapter: number,
  minVerse: number,
  maxVerse: number,
): string {
  const id = bookId.toUpperCase();
  if (minVerse <= 0 || maxVerse <= 0) return `${id}.${chapter}`;
  if (minVerse === maxVerse) return `${id}.${chapter}.${minVerse}`;
  return `${id}.${chapter}.${minVerse}-${maxVerse}`;
}

/** 同卷连续多章，如 GEN.1-GEN.3。 */
export function chapterSpanRef(bookId: string, fromChapter: number, toChapter: number): string {
  const id = bookId.toUpperCase();
  if (fromChapter === toChapter) return `${id}.${fromChapter}`;
  return `${id}.${fromChapter}-${id}.${toChapter}`;
}

/**
 * 生成打卡经文 ref：优先聚合今日同卷连续多章，否则本章经节范围，否则单章。
 */
export function buildCheckinRef(bookId: string, chapter: number): string {
  const id = bookId.toUpperCase();
  const chapters = todayChaptersInBook(id);
  const chapterSet = new Set(chapters);
  if (!chapterSet.has(chapter)) {
    chapterSet.add(chapter);
    chapters.push(chapter);
    chapters.sort((a, b) => a - b);
  }

  if (chapters.length > 1) {
    const lo = chapters[0];
    const hi = chapters[chapters.length - 1];
    const consecutive = chapters.length === hi - lo + 1
      && chapters.every((c, i) => c === lo + i);
    if (consecutive) return chapterSpanRef(id, lo, hi);
  }

  const range = getChapterVerseRange(id, chapter);
  if (range) return verseRangeRef(id, chapter, range.min, range.max);

  return chapterRef(id, chapter);
}
