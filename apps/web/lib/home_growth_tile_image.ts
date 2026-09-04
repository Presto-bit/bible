/** 成长区横卡左图：坑位固定摄影（52×52 方图裁切） */

export type HomeGrowthTileId = 'summary' | 'plan' | 'theme' | 'prayer';

const GROWTH_TILES: Record<HomeGrowthTileId, string> = {
  summary: '/illustrations/home/growth_summary.jpg',
  plan: '/illustrations/home/growth_plan.jpg',
  theme: '/illustrations/home/growth_theme.jpg',
  prayer: '/illustrations/home/growth_prayer.jpg',
};

export function homeGrowthTileImage(id: HomeGrowthTileId): string {
  return GROWTH_TILES[id];
}

/** 成长卡 id → 专属图 */
export function homeGrowthCardImageUrl(cardId: string): string | null {
  if (cardId === 'summary') return homeGrowthTileImage('summary');
  if (cardId === 'feature-plan' || cardId === 'plan') {
    return homeGrowthTileImage('plan');
  }
  if (cardId === 'feature-theme' || cardId === 'theme') {
    return homeGrowthTileImage('theme');
  }
  if (cardId === 'feature-prayer' || cardId === 'prayer') {
    return homeGrowthTileImage('prayer');
  }
  return null;
}

/** 方图裁切锚点（thumb cover） */
export function homeGrowthTileObjectPosition(id: HomeGrowthTileId): string {
  switch (id) {
    case 'summary':
      return 'center 42%';
    case 'plan':
      return 'center 45%';
    case 'theme':
      return 'center 40%';
    case 'prayer':
      return 'center 50%';
    default:
      return 'center';
  }
}

export function homeGrowthObjectPositionForCard(cardId: string): string {
  if (cardId === 'summary') return homeGrowthTileObjectPosition('summary');
  if (cardId === 'feature-plan' || cardId === 'plan') {
    return homeGrowthTileObjectPosition('plan');
  }
  if (cardId === 'feature-theme' || cardId === 'theme') {
    return homeGrowthTileObjectPosition('theme');
  }
  if (cardId === 'feature-prayer' || cardId === 'prayer') {
    return homeGrowthTileObjectPosition('prayer');
  }
  return 'center';
}
