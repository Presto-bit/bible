// 经文收藏（localStorage，与笔记页共用）。按 user_code 分桶。

import { enqueueBookmark } from './bookmark_sync';
import { userLsGet, userLsSet } from './user_storage';

const FAV_KEY = 'reader_favorites_v1';

export function loadFavoriteRefs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(userLsGet(FAV_KEY) || '[]');
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
    userLsSet(FAV_KEY, JSON.stringify(list.filter((r) => r !== ref)));
    enqueueBookmark(ref, true);
    return false;
  }
  userLsSet(FAV_KEY, JSON.stringify([ref, ...list]));
  enqueueBookmark(ref, false);
  return true;
}

/** 远端合并时写入收藏列表（不重复 enqueue）。 */
export function applyRemoteFavorite(ref: string, add: boolean) {
  const list = loadFavoriteRefs();
  if (add && !list.includes(ref)) {
    userLsSet(FAV_KEY, JSON.stringify([ref, ...list]));
  }
  if (!add) {
    userLsSet(FAV_KEY, JSON.stringify(list.filter((r) => r !== ref)));
  }
}
