/** 经卷封面：风景图 + 完整书名（横滑卡顶部） */

import { clientWithBasePath } from './basePath';
import { DAILY_WALLPAPER_FILES } from './daily_verse_wallpaper';
import { bookIdToChineseName, CANON_BOOK_IDS } from './ref_label';

function bookSeed(bookId: string): number {
  const id = bookId.toUpperCase();
  const idx = (CANON_BOOK_IDS as readonly string[]).indexOf(id);
  if (idx >= 0) return idx;
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

/** 按书卷稳定映射风景壁纸（与每日经文同源资源） */
export function bookCoverImageUrl(bookId: string): string {
  const file = DAILY_WALLPAPER_FILES[bookSeed(bookId) % DAILY_WALLPAPER_FILES.length];
  return clientWithBasePath(`/daily-wallpapers/${file}`);
}

export function bookCoverLabel(bookId: string): string {
  return bookIdToChineseName(bookId);
}

export function bookIdFromReaderHref(href: string): { bookId: string; chapter?: number } | null {
  try {
    const url = new URL(href, 'https://local.invalid');
    const book = url.searchParams.get('book');
    if (!book) return null;
    const chapterRaw = url.searchParams.get('chapter');
    return {
      bookId: book.toUpperCase(),
      chapter: chapterRaw ? Number.parseInt(chapterRaw, 10) : undefined,
    };
  } catch {
    return null;
  }
}
