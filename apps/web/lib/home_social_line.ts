import type { DiscoverSummary, Group } from './api';

export type HomeSocialLine = {
  text: string;
  href: string;
};

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
