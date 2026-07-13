/** 首页/启动空闲时预拉书卷目录与上次阅读章节，加速首次进圣经 Tab */

import { bibleBooks } from './bible_client';
import { loadChapterVerses } from './chapter_prefetch';
import { getLastRead } from './reading';

let scheduled = false;
let booksWarm = false;

export function scheduleBibleWarmup() {
  if (typeof window === 'undefined' || scheduled) return;
  scheduled = true;

  const run = () => {
    void warmBibleAssets();
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 1200);
  }
}

export async function warmBibleAssets(): Promise<void> {
  try {
    const books = await bibleBooks();
    booksWarm = books.length > 0;
    const last = getLastRead();
    if (!last || !booksWarm) return;
    const book = books.find((b) => b.id === last.bookId.toUpperCase());
    if (!book) return;
    const ch = Math.min(Math.max(1, last.chapter), book.chapter_count);
    await loadChapterVerses(book.id, ch, null);
    // 相邻章轻预取
    if (ch > 1) void loadChapterVerses(book.id, ch - 1, null);
    if (ch < book.chapter_count) void loadChapterVerses(book.id, ch + 1, null);
  } catch {
    /* 预热失败不影响主路径 */
  }
}

export function isBibleBooksWarm(): boolean {
  return booksWarm;
}
