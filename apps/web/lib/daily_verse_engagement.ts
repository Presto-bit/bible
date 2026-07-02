import { effectiveId } from './api';

const LIKE_KEY_PREFIX = 'presto_dv_like_';

function storageKey(verseDay: number): string {
  return `${LIKE_KEY_PREFIX}${verseDay}_${effectiveId()}`;
}

export function readLocalDailyVerseLike(verseDay: number): boolean | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(storageKey(verseDay));
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

export function writeLocalDailyVerseLike(verseDay: number, liked: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(verseDay), liked ? '1' : '0');
}
