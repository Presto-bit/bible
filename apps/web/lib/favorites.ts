// 经文收藏（localStorage，与笔记页共用）。

const FAV_KEY = 'reader_favorites_v1';

export function loadFavoriteRefs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export function isFavorite(ref: string): boolean {
  return loadFavoriteRefs().includes(ref);
}

/** 切换收藏；返回切换后是否已收藏。 */
export function toggleFavorite(ref: string): boolean {
  const list = loadFavoriteRefs();
  if (list.includes(ref)) {
    localStorage.setItem(FAV_KEY, JSON.stringify(list.filter((r) => r !== ref)));
    return false;
  }
  localStorage.setItem(FAV_KEY, JSON.stringify([ref, ...list]));
  return true;
}
