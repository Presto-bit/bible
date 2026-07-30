/** 每日经文展示：装饰引号，避免源文已有直角引号时出现。」」 */

import type { DailyVerse } from './api';

export function formatDailyVerseQuote(text: string): string {
  const inner = text
    .trim()
    .replace(/^[「『]+/u, '')
    .replace(/[」』]+$/u, '');
  return `「${inner}」`;
}

/** 每日经文 → 圣经 Tab 深链（定位到节，并触发阅读页轻闪提示）。 */
export function dailyVerseReaderHref(dv: Pick<DailyVerse, 'book' | 'chapter' | 'verse_start'>): string | null {
  const book = (dv.book || '').trim().toUpperCase();
  const chapter = Number(dv.chapter);
  if (!book || !Number.isFinite(chapter) || chapter < 1) return null;
  const ch = Math.floor(chapter);
  const params = new URLSearchParams({
    book,
    chapter: String(ch),
  });
  const verse = Number(dv.verse_start);
  if (Number.isFinite(verse) && verse >= 1) {
    const v = Math.floor(verse);
    params.set('verse', String(v));
    // ReaderTab / ReaderView 用 OSIS flash 滚到节并轻闪，不能只靠 verse=
    params.set('flash', `${book}.${ch}.${v}`);
  }
  return `/reader?${params.toString()}`;
}
