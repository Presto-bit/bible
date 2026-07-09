const HERO_RETURN_VERSE_KEY = 'home_hero_return_verse';

/** 从 Hero B 进入活动页前标记，回首页时轮播回到经文页 */
export function markHeroReturnToVerse() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(HERO_RETURN_VERSE_KEY, '1');
}

export function consumeHeroReturnToVerse(): boolean {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(HERO_RETURN_VERSE_KEY) !== '1') return false;
  sessionStorage.removeItem(HERO_RETURN_VERSE_KEY);
  return true;
}
