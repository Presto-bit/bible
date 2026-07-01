import type { FootprintRef } from './group_footprint';

export function memberAvatarInitial(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  return t.slice(0, 1);
}

export function formatDueCountdown(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  try {
    const due = new Date(dueAt);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / 86400000);
    if (diffDays < 0) return '已截止';
    if (diffDays === 0) return '今日截止';
    if (diffDays === 1) return '明天截止';
    return `${diffDays} 天后截止`;
  } catch {
    return null;
  }
}

export const FOOTPRINT_SOURCE_ORDER: FootprintRef['source'][] = [
  'task',
  'plan',
  'recent',
  'last',
  'favorite',
];

export const FOOTPRINT_SOURCE_LABELS: Record<FootprintRef['source'], string> = {
  task: '任务',
  plan: '今日计划',
  recent: '刚读过',
  last: '续读位置',
  favorite: '收藏',
};

export function groupFootprintsBySource(footprints: FootprintRef[]): {
  source: FootprintRef['source'];
  label: string;
  items: FootprintRef[];
}[] {
  return FOOTPRINT_SOURCE_ORDER.map((source) => ({
    source,
    label: FOOTPRINT_SOURCE_LABELS[source],
    items: footprints.filter((f) => f.source === source),
  })).filter((g) => g.items.length > 0);
}

export function myDisplayName(): string {
  if (typeof window === 'undefined') return '我';
  const name = localStorage.getItem('profile_name')?.trim();
  if (name) return name;
  const id = localStorage.getItem('presto_user_id') || localStorage.getItem('presto_guest_id') || '';
  return id ? `用户${id.slice(-4)}` : '我';
}
