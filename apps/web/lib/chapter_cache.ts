// 经文章节本地缓存，加速二次打开。

import type { Verse } from './api';

const PREFIX = 'presto_ch_';
const MAX_ENTRIES = 120;

export function getCachedChapter(
  book: string,
  chapter: number,
  version = 'cnv',
): Verse[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${PREFIX}${version}_${book}_${chapter}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as { ts: number; verses: Verse[] };
    if (Date.now() - data.ts > 7 * 86400000) return null;
    return data.verses;
  } catch {
    return null;
  }
}

export function setCachedChapter(
  book: string,
  chapter: number,
  verses: Verse[],
  version = 'cnv',
) {
  if (typeof window === 'undefined') return;
  const key = `${PREFIX}${version}_${book}_${chapter}`;
  localStorage.setItem(key, JSON.stringify({ ts: Date.now(), verses }));
  trimCache();
}

function trimCache() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  if (keys.length <= MAX_ENTRIES) return;
  keys.sort();
  keys.slice(0, keys.length - MAX_ENTRIES).forEach((k) => localStorage.removeItem(k));
}
