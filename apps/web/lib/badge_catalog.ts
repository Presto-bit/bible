import catalog from '../../../shared/badges.json';
import type { BadgeCategory } from './badges';

export type BadgeRule =
  | { type: 'ctx_gte'; field: string; value: number }
  | { type: 'stats_gte'; field: string; value: number }
  | { type: 'stats_array_len_gte'; field: string; value: number }
  | { type: 'stats_includes'; field: string; value: string }
  | { type: 'stats_bool'; field: string }
  | { type: 'custom'; name: string; args?: Record<string, unknown> };

export type BadgeProgress =
  | { type: 'ratio'; field: string; max: number }
  | { type: 'bool' }
  | { type: 'custom'; name: string; args?: Record<string, unknown> };

export type BadgeSpec = {
  id: string;
  label: string;
  desc: string;
  hint: string;
  icon: string;
  category: BadgeCategory;
  interesting: boolean;
  rule: BadgeRule;
  progress: BadgeProgress;
};

export const BADGE_CATALOG_VERSION = catalog.version as number;
export const BADGE_CATEGORY_LABELS = catalog.categories as Record<BadgeCategory, string>;
export const BADGE_CATEGORY_ORDER = catalog.categoryOrder as BadgeCategory[];
export const BADGE_SPECS = catalog.badges as BadgeSpec[];

/** 旧版成就 ID → 统一契约 ID */
export const LEGACY_BADGE_ID_MAP: Record<string, string> = {
  streak7: 'streak_7',
  streak30: 'streak_30',
  books10: 'books_5',
  nt: 'books_27',
  notes10: 'note_first',
  quiz50: 'memory_review',
  ai5: 'xiaoai_first',
};

export function normalizeBadgeId(id: string): string {
  return LEGACY_BADGE_ID_MAP[id] ?? id;
}

export function normalizeUnlockedAtMap(raw: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const id = normalizeBadgeId(k);
    out[id] = out[id] ? Math.min(out[id], v) : v;
  }
  return out;
}
