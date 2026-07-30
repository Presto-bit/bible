/** 首页群/共读文案：今日推荐侧卡与落点 B 共用。 */

import type { DiscoverSummary, Group } from './api';

export type HomeGroupLine = {
  /** 短状态（侧卡 title / 落点状态段） */
  status: string;
  /** 群名或辅助（侧卡 sub） */
  name: string;
  /** 落点单行：`{name} · {status}` */
  title: string;
  href: string;
  pending?: boolean;
  statPct?: number;
  statLabel?: string;
};

function pickFocusGroup(
  groups: Group[],
  summary: DiscoverSummary | null,
): Group | null {
  if (!groups.length) return null;
  return (
    (summary?.first_pending_group_id
      ? groups.find((g) => g.id === summary.first_pending_group_id)
      : null) ??
    groups.find((g) => !g.my_checked_in_today) ??
    groups.find((g) => (g.open_tasks ?? 0) > 0) ??
    groups[0] ??
    null
  );
}

/** 统一群行文案（L7）。 */
export function formatHomeGroupLine(
  groups: Group[],
  summary: DiscoverSummary | null,
): HomeGroupLine | null {
  if (!groups.length) return null;
  const g = pickFocusGroup(groups, summary);
  if (!g) return null;

  const members = g.members || 1;
  const checked = g.checked_in_today ?? 0;
  const statPct = members > 0 ? Math.round((checked / members) * 100) : undefined;
  const statLabel = members > 0 ? `${checked}/${members}` : undefined;

  if (!g.my_checked_in_today) {
    return {
      status: '等你打卡',
      name: g.name,
      title: `${g.name} · 等你打卡`,
      href: `/discover/group/${g.id}?focus=checkin`,
      pending: true,
      statPct: statPct ?? 0,
      statLabel,
    };
  }

  if ((g.open_tasks ?? 0) > 0) {
    const n = g.open_tasks ?? 0;
    return {
      status: `${n} 个任务`,
      name: g.name,
      title: `${g.name} · ${n} 个任务`,
      href: `/discover/group/${g.id}`,
      pending: true,
      statPct,
      statLabel,
    };
  }

  if (checked > 0) {
    return {
      status: `今日 ${checked} 人打卡`,
      name: g.name,
      title: `${g.name} · 今日 ${checked} 人打卡`,
      href: `/discover/group/${g.id}`,
      statPct,
      statLabel,
    };
  }

  return {
    status: '今日已打卡',
    name: g.name,
    title: `${g.name} · 今日已打卡`,
    href: `/discover/group/${g.id}`,
    statPct,
    statLabel,
  };
}

export function formatFriendsCheckedLine(
  summary: DiscoverSummary | null,
): { title: string; href: string } | null {
  const n = summary?.friends_checked_in_today ?? 0;
  if (n <= 0) return null;
  return {
    title: `今天 ${n} 位好友已打卡`,
    href: '/discover',
  };
}
