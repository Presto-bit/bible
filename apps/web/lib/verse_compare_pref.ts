/** 节级对照半屏：记住用户偏好的第二译本。 */

const SECONDARY_KEY = 'presto_verse_compare_secondary_v1';

export function getCompareSecondaryVersion(fallback = 'cnv'): string {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(SECONDARY_KEY)?.trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

export function setCompareSecondaryVersion(id: string) {
  if (typeof window === 'undefined') return;
  const v = id.trim();
  if (!v) return;
  try {
    localStorage.setItem(SECONDARY_KEY, v);
  } catch {
    /* ignore */
  }
}
