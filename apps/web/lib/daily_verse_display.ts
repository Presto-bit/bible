/** 每日经文展示：装饰引号，避免源文已有直角引号时出现。」」 */

import type { DailyVerse } from './api';

export function formatDailyVerseQuote(text: string): string {
  const inner = text
    .trim()
    .replace(/^[「『]+/u, '')
    .replace(/[」』]+$/u, '');
  return `「${inner}」`;
}

/** 每日经文 → 圣经 Tab 深链（优先 book/chapter/verse，不用中文 ref）。 */
export function dailyVerseReaderHref(dv: Pick<DailyVerse, 'book' | 'chapter' | 'verse_start'>): string | null {
  const book = (dv.book || '').trim();
  const chapter = Number(dv.chapter);
  if (!book || !Number.isFinite(chapter) || chapter < 1) return null;
  const params = new URLSearchParams({
    book,
    chapter: String(Math.floor(chapter)),
  });
  const verse = Number(dv.verse_start);
  if (Number.isFinite(verse) && verse >= 1) {
    params.set('verse', String(Math.floor(verse)));
  }
  return `/reader?${params.toString()}`;
}
