import type { DiscoverSummary, Group } from './api';
import {
  formatFriendsCheckedLine,
  formatHomeGroupLine,
} from './home_group_line';

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

/** 共读卡：今日推荐侧卡；文案与落点共用 formatHomeGroupLine */
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

  const line = formatHomeGroupLine(groups, summary);
  if (line?.pending && line.status === '等你打卡') {
    return {
      title: '今日待打卡',
      sub: line.name,
      href: line.href,
      statPct: line.statPct,
      statLabel: line.statLabel,
    };
  }
  if (line?.pending && line.status.includes('任务')) {
    return {
      title: line.status,
      sub: line.name,
      href: line.href,
      statPct: line.statPct,
      statLabel: line.statLabel,
    };
  }

  const friends = formatFriendsCheckedLine(summary);
  // 全员已打卡且有好友动态时，侧卡可展示好友（与旧逻辑接近）
  if (friends && line && !line.pending) {
    return {
      title: friends.title.replace(/^今天\s*/, ''),
      sub: '看看动态',
      href: friends.href,
    };
  }

  if (line) {
    return {
      title: line.status,
      sub: line.name,
      href: line.href,
      statPct: line.statPct,
      statLabel: line.statLabel,
    };
  }

  const primary = groups[0];
  return {
    title: primary.name,
    sub: '今日已打卡',
    href: `/discover/group/${primary.id}`,
  };
}

export function buildHomeSocialLine(
  groups: Group[],
  summary: DiscoverSummary | null,
): HomeSocialLine {
  if (!groups.length) {
    return { text: '邀请好友一起打卡', href: '/discover' };
  }
  const line = formatHomeGroupLine(groups, summary);
  if (line) return { text: line.title, href: line.href };
  const friends = formatFriendsCheckedLine(summary);
  if (friends) return { text: friends.title, href: friends.href };
  return { text: '去发现，找人一起读', href: '/discover' };
}
