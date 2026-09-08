import type { BibleSearchHit } from '@/lib/api';

/** 搜索结果 → 读经深链（定位到节 + flash 轻闪，同每日经文） */
export function searchHitReaderHref(
  hit: Pick<BibleSearchHit, 'book' | 'chapter' | 'verse' | 'osis'>,
): string {
  const book = hit.book.trim().toUpperCase();
  const chapter = Math.floor(hit.chapter);
  const params = new URLSearchParams({
    book,
    chapter: String(chapter),
  });
  const verse = Math.floor(hit.verse);
  if (Number.isFinite(verse) && verse >= 1) {
    params.set('verse', String(verse));
    params.set('flash', hit.osis || `${book}.${chapter}.${verse}`);
  }
  return `/reader?${params.toString()}`;
}
