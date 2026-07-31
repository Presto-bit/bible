/** 首页折叠线下「稳定落点」：与今日推荐去重后的非成长入口。 */

import type { DiscoverSummary, Group } from './api';
import type { HomeGroupRailInput } from './home_social_line';
import {
  formatFriendsCheckedLine,
  formatHomeGroupLine,
} from './home_group_line';
import {
  groupIdFromHref,
  homeMediaDaySeed,
  homeMediaGroupCoverUrl,
  homeMediaIconForTone,
  homeMediaSceneUrl,
  toneFromAnchorTag,
  type HomeMediaIconId,
  type HomeMediaTone,
} from './home_media_visual';

export type HomeAnchorBlockModel = {
  tag: '小组' | '同行' | '发现';
  title: string;
  href: string;
  pillActive?: boolean;
  mediaTone: HomeMediaTone;
  icon: HomeMediaIconId;
  imageUrl?: string | null;
};

export type BuildHomeAnchorOpts = {
  groups: Group[];
  summary: DiscoverSummary | null;
  /**
   * 今日推荐是否已占用群信息（有群且侧卡/主卡露出共读）。
   * true 时 B 不再出「小组」，改同行或发现（R1/U1）。
   */
  todayPanelHasGroup?: boolean;
};

function withMedia(
  block: Omit<HomeAnchorBlockModel, 'mediaTone' | 'icon' | 'imageUrl'>,
): HomeAnchorBlockModel {
  const mediaTone = toneFromAnchorTag(block.tag);
  const icon = homeMediaIconForTone(mediaTone);
  let imageUrl: string | null = null;
  if (mediaTone === 'group') {
    const gid = groupIdFromHref(block.href);
    imageUrl = gid
      ? homeMediaGroupCoverUrl(gid)
      : homeMediaSceneUrl('group', homeMediaDaySeed());
  } else {
    imageUrl = homeMediaSceneUrl(mediaTone, homeMediaDaySeed());
  }
  return { ...block, mediaTone, icon, imageUrl };
}

/** 有群且推荐未占群 → 小组；否则同行 > 发现。 */
export function buildHomeAnchorBlock(
  opts: BuildHomeAnchorOpts,
): HomeAnchorBlockModel {
  const { groups, summary, todayPanelHasGroup = false } = opts;
  const hasGroups = groups.length > 0;
  const friends = formatFriendsCheckedLine(summary);

  // 推荐区已含群 → 禁止重复小组
  if (hasGroups && todayPanelHasGroup) {
    if (friends) {
      return withMedia({
        tag: '同行',
        title: friends.title,
        href: friends.href,
        pillActive: true,
      });
    }
    return withMedia({
      tag: '发现',
      title: '去发现，找人一起读',
      href: '/discover',
    });
  }

  if (hasGroups) {
    const line = formatHomeGroupLine(groups, summary);
    if (line) {
      return withMedia({
        tag: '小组',
        title: line.title,
        href: line.href,
        pillActive: true,
      });
    }
  }

  if (friends) {
    return withMedia({
      tag: '同行',
      title: friends.title,
      href: friends.href,
      pillActive: true,
    });
  }

  // 冷启动：与推荐区「创建共读」错开（U5）
  return withMedia({
    tag: '发现',
    title: hasGroups ? '去发现逛一逛' : '去发现，找人一起读',
    href: '/discover',
  });
}

/**
 * 无群列表时用推荐轨兜底。
 * 若轨本身是群深链，视为推荐已占群 → 落点改发现/同行语义。
 */
export function buildHomeAnchorFromGroupRail(
  group: HomeGroupRailInput,
  opts?: { summaryFriendsChecked?: number },
): HomeAnchorBlockModel {
  const isGroupHref = group.href.startsWith('/discover/group/');
  if (isGroupHref) {
    // 推荐侧已有群 → B 禁止再出小组
    const n = opts?.summaryFriendsChecked ?? 0;
    if (n > 0) {
      return withMedia({
        tag: '同行',
        title: `今天 ${n} 位好友已打卡`,
        href: '/discover',
        pillActive: true,
      });
    }
    return withMedia({
      tag: '发现',
      title: '去发现，找人一起读',
      href: '/discover',
    });
  }

  if (group.title.includes('好友')) {
    return withMedia({
      tag: '同行',
      title: group.title.startsWith('今天')
        ? group.title
        : `今天 ${group.title}`,
      href: group.href || '/discover',
      pillActive: true,
    });
  }

  if (group.title === '创建共读') {
    return withMedia({
      tag: '发现',
      title: '去发现，找人一起读',
      href: '/discover',
    });
  }

  return withMedia({
    tag: '发现',
    title: group.title || '去发现逛一逛',
    href: group.href || '/discover',
  });
}
