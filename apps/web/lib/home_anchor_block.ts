/** 首页折叠线下「稳定落点」：非成长资产，保证末屏至少有一块可点入口。 */

import type { DiscoverSummary, Group } from './api';
import type { HomeGroupRailInput } from './home_social_line';

export type HomeAnchorBlockModel = {
  tag: '小组' | '同行' | '发现';
  title: string;
  href: string;
  pillActive?: boolean;
};

/** 有群 → 小组；有好友打卡 → 同行；否则发现冷启动。 */
export function buildHomeAnchorBlock(
  groups: Group[],
  summary: DiscoverSummary | null,
): HomeAnchorBlockModel {
  if (groups.length) {
    const pendingGroup =
      (summary?.first_pending_group_id
        ? groups.find((g) => g.id === summary.first_pending_group_id)
        : null) ??
      groups.find((g) => !g.my_checked_in_today) ??
      groups.find((g) => (g.open_tasks ?? 0) > 0) ??
      groups[0];

    if (pendingGroup && !pendingGroup.my_checked_in_today) {
      return {
        tag: '小组',
        title: `${pendingGroup.name} · 等你打卡`,
        href: `/discover/group/${pendingGroup.id}?focus=checkin`,
        pillActive: true,
      };
    }
    if (pendingGroup && (pendingGroup.open_tasks ?? 0) > 0) {
      return {
        tag: '小组',
        title: `${pendingGroup.name} · ${pendingGroup.open_tasks} 个任务`,
        href: `/discover/group/${pendingGroup.id}`,
        pillActive: true,
      };
    }
    const checked = pendingGroup?.checked_in_today ?? 0;
    const name = pendingGroup?.name || groups[0].name;
    return {
      tag: '小组',
      title:
        checked > 0 ? `${name} · 今日 ${checked} 人打卡` : `${name} · 去看看`,
      href: `/discover/group/${pendingGroup?.id || groups[0].id}`,
      pillActive: true,
    };
  }

  const friendsChecked = summary?.friends_checked_in_today ?? 0;
  if (friendsChecked > 0) {
    return {
      tag: '同行',
      title: `今天 ${friendsChecked} 位好友已打卡`,
      href: '/discover',
      pillActive: true,
    };
  }

  return {
    tag: '发现',
    title: '和弟兄姊妹一起读',
    href: '/discover',
  };
}

/** 无群列表缓存时，用今日推荐侧的小组轨输入兜底。 */
export function buildHomeAnchorFromGroupRail(
  group: HomeGroupRailInput,
): HomeAnchorBlockModel {
  if (group.href.startsWith('/discover/group/')) {
    return {
      tag: '小组',
      title: group.sub ? `${group.sub} · ${group.title}` : group.title,
      href: group.href,
      pillActive: true,
    };
  }
  if (group.title.includes('好友')) {
    return {
      tag: '同行',
      title: group.title,
      href: group.href || '/discover',
      pillActive: true,
    };
  }
  return {
    tag: '发现',
    title: group.title === '创建共读' ? '和弟兄姊妹一起读' : group.title,
    href: group.href || '/discover',
  };
}
