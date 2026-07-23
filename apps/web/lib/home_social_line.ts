import type { DiscoverSummary, Group } from './api';

export type HomeSocialLine = {
  text: string;
  href: string;
};

export type HomeGroupRailInput = {
  title: string;
  sub: string;
  href: string;
  statPct?: number;
  statLabel?: string;
};

/** 共读卡：并入首页横滑轨 */
export function buildHomeGroupRailInput(
  groups: Group[],
  summary: DiscoverSummary | null,
): HomeGroupRailInput {
  if (!groups.length) {
    return {
      title: '创建共读',
      sub: '创建或加入',
      href: '/discover',
    };
  }

  const pendingGroup =
    (summary?.first_pending_group_id
      ? groups.find((g) => g.id === summary.first_pending_group_id)
      : null)
    ?? groups.find((g) => !g.my_checked_in_today)
    ?? groups.find((g) => (g.open_tasks ?? 0) > 0)
    ?? null;

  if (pendingGroup && !pendingGroup.my_checked_in_today) {
    const members = pendingGroup.members || 1;
    const checked = pendingGroup.checked_in_today ?? 0;
    return {
      title: '今日待打卡',
      sub: pendingGroup.name,
      href: `/discover/group/${pendingGroup.id}?focus=checkin`,
      statPct: members > 0 ? Math.round((checked / members) * 100) : 0,
      statLabel: `${checked}/${members}`,
    };
  }

  if (pendingGroup && (pendingGroup.open_tasks ?? 0) > 0) {
    const members = pendingGroup.members || 1;
    const checked = pendingGroup.checked_in_today ?? 0;
    return {
      title: `${pendingGroup.open_tasks} 个任务`,
      sub: pendingGroup.name,
      href: `/discover/group/${pendingGroup.id}`,
      statPct: members > 0 ? Math.round((checked / members) * 100) : undefined,
      statLabel: members > 0 ? `${checked}/${members}` : undefined,
    };
  }

  const friendsChecked = summary?.friends_checked_in_today ?? 0;
  if (friendsChecked > 0) {
    return {
      title: `${friendsChecked} 位好友已打卡`,
      sub: '看看动态',
      href: '/discover',
    };
  }

  if (pendingGroup) {
    const checked = pendingGroup.checked_in_today ?? 0;
    const members = pendingGroup.members || 1;
    return {
      title: pendingGroup.name,
      sub: checked > 0 ? `今日 ${checked} 人` : '今日已打卡',
      href: `/discover/group/${pendingGroup.id}`,
      statPct: members > 0 ? Math.round((checked / members) * 100) : undefined,
      statLabel: members > 0 ? `${checked}/${members}` : undefined,
    };
  }

  const checked = groups.reduce((n, g) => n + (g.checked_in_today ?? 0), 0);
  const primary = groups[0];
  return {
    title: checked > 0 ? '今日共读已完成' : primary.name,
    sub: checked > 0 ? '看看动态' : '今日已打卡',
    href: checked > 0 ? '/discover' : `/discover/group/${primary.id}`,
  };
}

export function buildHomeSocialLine(
  groups: Group[],
  summary: DiscoverSummary | null,
): HomeSocialLine {
  if (!groups.length) {
    return { text: '邀请好友一起打卡', href: '/discover' };
  }

  const pendingGroup =
    (summary?.first_pending_group_id
      ? groups.find((g) => g.id === summary.first_pending_group_id)
      : null)
    ?? groups.find((g) => !g.my_checked_in_today)
    ?? groups.find((g) => (g.open_tasks ?? 0) > 0)
    ?? null;

  if (pendingGroup && !pendingGroup.my_checked_in_today) {
    return {
      text: `${pendingGroup.name} · 等你打卡`,
      href: `/discover/group/${pendingGroup.id}?focus=checkin`,
    };
  }

  if (pendingGroup && (pendingGroup.open_tasks ?? 0) > 0) {
    return {
      text: `${pendingGroup.name} · ${pendingGroup.open_tasks} 个任务待完成`,
      href: `/discover/group/${pendingGroup.id}`,
    };
  }

  const friendsChecked = summary?.friends_checked_in_today ?? 0;
  if (friendsChecked > 0) {
    return {
      text: `今天 ${friendsChecked} 位好友已打卡`,
      href: '/discover',
    };
  }

  if (pendingGroup) {
    const checked = pendingGroup.checked_in_today ?? 0;
    return {
      text: `${pendingGroup.name} · 今日 ${checked} 人已打卡`,
      href: `/discover/group/${pendingGroup.id}`,
    };
  }

  const checked = groups.reduce((n, g) => n + (g.checked_in_today ?? 0), 0);
  return {
    text: checked > 0 ? `今日共读已完成 · 看看动态` : `${groups[0].name} · 今日已打卡`,
    href: '/discover',
  };
}
