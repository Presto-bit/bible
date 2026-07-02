import { effectiveId, type GroupDetail, type GroupMember, type GroupTask } from './api';
import type { FootprintRef } from './group_footprint';

export function asGroupMembers(v: unknown): GroupMember[] {
  return Array.isArray(v) ? v : [];
}

export function asGroupTasks(v: unknown): GroupTask[] {
  return Array.isArray(v) ? v : [];
}

/** 群详情 members 字段：成员列表；列表接口里 members 是人数。 */
export function groupMemberCount(detail: Pick<GroupDetail, 'members'>): number {
  const m = detail.members as unknown;
  if (Array.isArray(m)) return m.length;
  if (typeof m === 'number' && Number.isFinite(m)) return m;
  return 0;
}

export function normalizeGroupDetail(detail: GroupDetail): GroupDetail {
  return {
    ...detail,
    members: asGroupMembers(detail.members),
    tasks: asGroupTasks(detail.tasks),
  };
}

export function memberAvatarInitial(name: string | null | undefined): string {
  const t = (name ?? '').trim();
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
  const id = effectiveId();
  return id ? `用户${id.slice(-4)}` : '我';
}
