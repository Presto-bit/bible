import type { DailyVerse } from './api';

const CACHE_KEY = 'presto_dv_snapshot';

export function readCachedDailyVerse(): DailyVerse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DailyVerse) : null;
  } catch {
    return null;
  }
}

export function writeCachedDailyVerse(verse: DailyVerse) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(verse));
  } catch {
    /* quota */
  }
}
