// 经文章节本地缓存：内存优先，二次打开秒开；LS 异步裁剪避免主线程尖刺。

import type { Verse } from './api';

const PREFIX = 'presto_ch_';
const MAX_ENTRIES = 120;
const MAX_MEM = 48;
const TTL_MS = 7 * 86400000;

type Entry = { ts: number; verses: Verse[] };

const mem = new Map<string, Entry>();
let writesSinceTrim = 0;

function cacheKey(book: string, chapter: number, version: string) {
  return `${PREFIX}${version}_${book}_${chapter}`;
}

function touchMem(key: string, entry: Entry) {
  mem.delete(key);
  mem.set(key, entry);
  while (mem.size > MAX_MEM) {
    const oldest = mem.keys().next().value;
    if (oldest == null) break;
    mem.delete(oldest);
  }
}

export function getCachedChapter(
  book: string,
  chapter: number,
  version = 'cuvs',
): Verse[] | null {
  if (typeof window === 'undefined') return null;
  const key = cacheKey(book, chapter, version);
  const hit = mem.get(key);
  if (hit && Date.now() - hit.ts <= TTL_MS) {
    touchMem(key, hit);
    return hit.verses;
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Entry;
    if (Date.now() - data.ts > TTL_MS) return null;
    touchMem(key, data);
    return data.verses;
  } catch {
    return null;
  }
}

export function setCachedChapter(
  book: string,
  chapter: number,
  verses: Verse[],
  version = 'cuvs',
) {
  if (typeof window === 'undefined') return;
  const key = cacheKey(book, chapter, version);
  const entry: Entry = { ts: Date.now(), verses };
  touchMem(key, entry);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota */
  }
  writesSinceTrim += 1;
  if (writesSinceTrim >= 8) {
    writesSinceTrim = 0;
    scheduleTrimCache();
  }
}

let trimScheduled = false;
function scheduleTrimCache() {
  if (trimScheduled) return;
  trimScheduled = true;
  const run = () => {
    trimScheduled = false;
    trimCache();
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 0);
  }
}

function trimCache() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  if (keys.length <= MAX_ENTRIES) return;
  // 按 key 排序近似 LRU 不足，但避免每次写入全表扫描；超限时删最旧前缀段
  keys.sort();
  keys.slice(0, keys.length - MAX_ENTRIES).forEach((k) => {
    localStorage.removeItem(k);
    mem.delete(k);
  });
}
