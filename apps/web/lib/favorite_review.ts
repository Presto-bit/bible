/** 收藏经节复习卡片（§7 P2） */

import { loadFavoriteRefs } from './favorites';

export function favoriteReviewCards(limit = 3): { ref: string; label: string }[] {
  const refs = loadFavoriteRefs();
  if (!refs.length) return [];
  const shuffled = [...refs].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit).map((ref) => ({
    ref,
    label: ref.replace(/\./g, ' '),
  }));
}
