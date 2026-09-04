/** 首页成长区：摘要 + 功能卡；与今日推荐去重；最多 5 张。 */

import {
  homeMediaIconForTone,
  homeMediaMonthProgressPct,
  type HomeMediaIconId,
  type HomeMediaTone,
} from './home_media_visual';
import { homeGrowthCardImageUrl } from './home_growth_tile_image';
import { buildReport, todayMinutes } from './reading';
import type { HomeTodayPanelModel } from './home_today_panel';

export const HOME_GROWTH_MAX_CARDS = 5;

export type HomeGrowthCard = {
  id: string;
  tag: string;
  title: string;
  detail?: string;
  metric?: { prefix?: string; value: string; suffix?: string };
  href: string;
  kind?: 'summary' | 'feature';
  mediaTone: HomeMediaTone;
  icon: HomeMediaIconId;
  imageUrl?: string | null;
  progressPct?: number;
};

export type HomeGrowthModel = {
  cards: HomeGrowthCard[];
};

export type HomeGrowthOccupied = {
  plan: boolean;
  prayer: boolean;
};

export type HomeGrowthFeatureInput = {
  title: string;
  detail?: string;
  href: string;
};

export type BuildHomeGrowthOpts = {
  todayMin?: number;
  monthDays?: number;
  /** 今日推荐已占用的功能（同 id 不再出） */
  occupied?: HomeGrowthOccupied;
  plan?: HomeGrowthFeatureInput | null;
  prayer?: HomeGrowthFeatureInput | null;
  theme?: HomeGrowthFeatureInput | null;
};

/** 从今日推荐四坑提取已占用功能（计划仅在成长区；祷告占 [4]）。 */
export function occupiedFromTodayPanel(
  panel: HomeTodayPanelModel | null | undefined,
): HomeGrowthOccupied {
  if (!panel) return { plan: false, prayer: false };
  return {
    plan: false,
    prayer: panel.prayer.id === 'prayer',
  };
}

function pushCard(cards: HomeGrowthCard[], card: HomeGrowthCard) {
  if (cards.length >= HOME_GROWTH_MAX_CARDS) return;
  cards.push(card);
}

/**
 * 顺序：摘要 → 读经计划 → 主题探索 → 祷告（跳过今日推荐已有的）。
 */
export function buildHomeGrowthModel(opts?: BuildHomeGrowthOpts): HomeGrowthModel {
  const report = buildReport();
  const todayMin = opts?.todayMin ?? todayMinutes();
  const monthDays = opts?.monthDays ?? report.monthDays;
  const now = new Date();
  const occupied = opts?.occupied ?? { plan: false, prayer: false };

  const cards: HomeGrowthCard[] = [];

  pushCard(cards, {
    id: 'summary',
    kind: 'summary',
    tag: '今日',
    title: `今日 ${todayMin} 分钟`,
    detail: `本月已读 ${monthDays} 天`,
    metric: {
      prefix: '今日',
      value: String(todayMin),
      suffix: '分钟',
    },
    href: '/report',
    mediaTone: 'summary',
    icon: homeMediaIconForTone('summary'),
    imageUrl: homeGrowthCardImageUrl('summary'),
    progressPct: homeMediaMonthProgressPct(monthDays, now),
  });

  // 1. 读经计划
  if (!occupied.plan) {
    const plan = opts?.plan;
    if (plan) {
      pushCard(cards, {
        id: 'feature-plan',
        kind: 'feature',
        tag: '计划',
        title: plan.title,
        detail: plan.detail || '继续今日计划',
        href: plan.href,
        mediaTone: 'plan',
        icon: homeMediaIconForTone('plan'),
        imageUrl: homeGrowthCardImageUrl('feature-plan'),
      });
    } else {
      pushCard(cards, {
        id: 'feature-plan',
        kind: 'feature',
        tag: '计划',
        title: '选一个读经计划',
        detail: '按日程读完一卷书',
        href: '/plans',
        mediaTone: 'plan',
        icon: homeMediaIconForTone('plan'),
        imageUrl: homeGrowthCardImageUrl('feature-plan'),
      });
    }
  }

  // 2. 主题探索
  {
    const theme = opts?.theme;
    pushCard(cards, {
      id: 'feature-theme',
      kind: 'feature',
      tag: '主题',
      title: theme?.title || '探索经文主题',
      detail: theme?.detail || '按主题找经文',
      href: theme?.href || '/search',
      mediaTone: 'theme',
      icon: homeMediaIconForTone('theme'),
      imageUrl: homeGrowthCardImageUrl('feature-theme'),
    });
  }

  // 3. 祷告
  if (!occupied.prayer) {
    const prayer = opts?.prayer;
    if (prayer) {
      pushCard(cards, {
        id: 'feature-prayer',
        kind: 'feature',
        tag: '祷告',
        title: prayer.title,
        detail: prayer.detail || '去祷告',
        href: prayer.href,
        mediaTone: 'prayer',
        icon: homeMediaIconForTone('prayer'),
        imageUrl: homeGrowthCardImageUrl('feature-prayer'),
      });
    } else {
      pushCard(cards, {
        id: 'feature-prayer',
        kind: 'feature',
        tag: '祷告',
        title: '开始祷告',
        detail: '安静片刻，向神说话',
        href: '/pray',
        mediaTone: 'prayer',
        icon: homeMediaIconForTone('prayer'),
        imageUrl: homeGrowthCardImageUrl('feature-prayer'),
      });
    }
  }

  return { cards };
}

/** @deprecated */
export function buildHomeGrowthCards(opts?: BuildHomeGrowthOpts): HomeGrowthCard[] {
  return buildHomeGrowthModel(opts).cards;
}
