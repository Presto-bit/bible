// 成就徽章：元数据来自 shared/badges.json，规则见 badge_eval.ts

import { maxGroupCheckinStreak, type BadgeStats } from './badge_events';
import {
  BADGE_CATEGORY_LABELS,
  BADGE_CATEGORY_ORDER,
  BADGE_SPECS,
  type BadgeSpec,
} from './badge_catalog';
import { evaluateAllBadges } from './badge_eval';

export type BadgeCategory =
  | 'persistence'
  | 'explore'
  | 'xiaoai'
  | 'devotional'
  | 'social'
  | 'easter_egg';

export { BADGE_CATEGORY_LABELS, BADGE_CATEGORY_ORDER, BADGE_SPECS };
export type { BadgeSpec };

export interface BadgeDef {
  id: string;
  label: string;
  desc: string;
  hint: string;
  icon: string;
  category: BadgeCategory;
  done: boolean;
  progress: string;
  interesting: boolean;
  unlockedAt?: number;
}

export type BadgeCtx = {
  streak: number;
  readBooks: number;
  ntBooksRead: number;
  otBooksRead: number;
  totalBooks: number;
  noteCount: number;
  monthDays: number;
  totalMinutes: number;
  totalChapters: number;
  highlightCount: number;
  highlightColors: number;
  bookmarkCount: number;
  thoughtCount: number;
  maxNoteLen: number;
  planDays: number;
  friendCount: number;
  bookTotals: Record<string, number>;
  stats: BadgeStats;
};

export { maxGroupCheckinStreak };

export function computeAllBadges(ctx: BadgeCtx): BadgeDef[] {
  return evaluateAllBadges(BADGE_SPECS, ctx);
}
