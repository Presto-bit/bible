/** 首页「今日推荐」：左大 + 右双；活动优先占用最多 3 个坑位 */

import type { RailIconId } from './home_rail';
import { bookIdFromReaderHref } from './book_cover';
import { trimRailSub, trimRailTitle } from './home_rail';

/** 侧卡标题宜短，便于窄栏扫读 */
const SIDE_TITLE_MAX = 10;

export type HomeTodayPanelSlot = {
  id: string;
  tag: string;
  title: string;
  sub: string;
  href: string;
  icon: RailIconId;
  bookId?: string;
  /** 主卡 / 侧卡 CTA */
  cta?: string;
  /** 侧卡角标（如打卡 2/5） */
  badge?: string;
  /** 侧卡完成态（弱化） */
  done?: boolean;
  /** 侧卡待办强调 */
  pending?: boolean;
};

export type HomeTodayPanelModel = {
  primary: HomeTodayPanelSlot;
  group: HomeTodayPanelSlot;
  prayer: HomeTodayPanelSlot;
};

export type HomeTodayCampaignInput = {
  id: string;
  tag: string;
  title: string;
  sub: string;
  href: string;
};

export type HomeTodayPanelInput = {
  resume?: {
    title: string;
    sub: string;
    href: string;
    bookId: string;
    chapter: number;
  };
  plan?: {
    title: string;
    sub: string;
    href: string;
    progressPct?: number;
    bookId?: string;
    chapter?: number;
  };
  prayer?: { title: string; sub: string; href: string };
  group?: {
    title: string;
    sub: string;
    href: string;
    statPct?: number;
    statLabel?: string;
  };
  suggest?: { title: string; sub: string; href: string; bookId?: string };
  /** 群定向 / 全站活动，最多 3 张：依次占主卡 / 右上 / 右下 */
  campaigns?: HomeTodayCampaignInput[];
};

function campaignPrimary(c: HomeTodayCampaignInput): HomeTodayPanelSlot {
  return {
    id: `campaign-${c.id}`,
    tag: c.tag || '活动',
    title: trimRailTitle(c.title),
    sub: '',
    href: c.href,
    icon: 'devotional',
    cta: '进入',
  };
}

function campaignSide(c: HomeTodayCampaignInput): HomeTodayPanelSlot {
  return {
    id: `campaign-${c.id}`,
    tag: c.tag || '活动',
    title: trimRailTitle(c.title, SIDE_TITLE_MAX),
    sub: '',
    href: c.href,
    icon: 'devotional',
    cta: '进入',
  };
}

function primaryFromInput(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  if (input.plan) {
    return {
      id: 'plan',
      tag: '计划',
      title: trimRailTitle(input.plan.title),
      sub: trimRailSub(input.plan.sub || ''),
      href: input.plan.href,
      icon: 'plan',
      bookId: input.plan.bookId,
      cta: '继续',
    };
  }
  if (input.resume) {
    return {
      id: 'resume',
      tag: '继续',
      title: trimRailTitle(input.resume.title),
      sub: '',
      href: input.resume.href,
      icon: 'resume',
      bookId: input.resume.bookId,
      cta: '继续',
    };
  }
  const suggest = input.suggest;
  const bookId =
    suggest?.bookId ||
    (suggest ? bookIdFromReaderHref(suggest.href)?.bookId : undefined) ||
    'JHN';
  return {
    id: 'suggest',
    tag: '开始',
    title: trimRailTitle(suggest?.title || '从约翰福音开始'),
    sub: '',
    href: suggest?.href || '/reader?book=JHN&chapter=1',
    icon: 'suggest',
    bookId,
    cta: '去读',
  };
}

function isGroupEmpty(g: NonNullable<HomeTodayPanelInput['group']>): boolean {
  const title = (g.title || '').trim();
  const sub = (g.sub || '').trim();
  return (
    !title ||
    title === '邀请好友共读' ||
    title === '创建共读' ||
    sub === '创建或加入'
  );
}

/**
 * 共读侧卡：标签固定；标题只写一件事；待办用角标；完成态弱化。
 */
function groupSlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const g = input.group;
  if (!g || isGroupEmpty(g)) {
    return {
      id: 'group',
      tag: '共读',
      title: '创建共读',
      sub: '',
      href: g?.href || '/discover',
      icon: 'group',
      cta: '去创建',
    };
  }

  const status = g.title.trim();
  const hint = (g.sub || '').trim();
  const badge = g.statLabel?.trim() || undefined;

  if (status === '今日待打卡') {
    return {
      id: 'group',
      tag: '共读',
      title: '待打卡',
      sub: '',
      href: g.href || '/discover',
      icon: 'group',
      badge,
      cta: '去打卡',
      pending: true,
    };
  }

  const taskMatch = status.match(/^(\d+)\s*个任务$/);
  if (taskMatch) {
    return {
      id: 'group',
      tag: '共读',
      title: `${taskMatch[1]} 个任务`,
      sub: '',
      href: g.href || '/discover',
      icon: 'group',
      badge,
      cta: '去完成',
      pending: true,
    };
  }

  if (status === '今日共读已完成') {
    return {
      id: 'group',
      tag: '共读',
      title: '今日已完成',
      sub: '',
      href: g.href || '/discover',
      icon: 'group',
      cta: '看看',
      done: true,
    };
  }

  const friendsMatch = status.match(/^(\d+)\s*位好友/);
  if (friendsMatch || hint === '看看动态') {
    return {
      id: 'group',
      tag: '共读',
      title: friendsMatch ? `${friendsMatch[1]} 位好友` : '看看动态',
      sub: '',
      href: g.href || '/discover',
      icon: 'group',
      cta: '看看',
    };
  }

  if (hint === '今日已打卡') {
    return {
      id: 'group',
      tag: '共读',
      title: '今日已打卡',
      sub: '',
      href: g.href || '/discover',
      icon: 'group',
      badge,
      cta: '进入',
      done: true,
    };
  }

  if (/^今日\s*\d+\s*人$/.test(hint)) {
    return {
      id: 'group',
      tag: '共读',
      title: trimRailTitle(hint, SIDE_TITLE_MAX),
      sub: '',
      href: g.href || '/discover',
      icon: 'group',
      badge,
      cta: '进入',
    };
  }

  return {
    id: 'group',
    tag: '共读',
    title: trimRailTitle(status, SIDE_TITLE_MAX),
    sub: '',
    href: g.href || '/discover',
    icon: 'group',
    badge,
    cta: '进入',
  };
}

/**
 * 祷告侧卡：有计划只显示「第 N 天」；空态可行动并直达祷告 tab。
 */
function prayerSlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const p = input.prayer;
  if (!p) {
    return {
      id: 'prayer',
      tag: '祷告',
      title: '开始祷告',
      sub: '',
      href: '/pray',
      icon: 'prayer',
      cta: '去祷告',
    };
  }
  const day = (p.title || '').trim();
  return {
    id: 'prayer',
    tag: '祷告',
    title: trimRailTitle(day || '今日祷告', SIDE_TITLE_MAX),
    sub: '',
    href: '/pray',
    icon: 'prayer',
    cta: '去祷告',
  };
}

/**
 * 固定三坑：主行动 | 共读 | 祷告。
 * 活动运营曝光走这三张卡（不占每日经文 Hero）；有活动时按顺序优先占位。
 */
export function buildHomeTodayPanel(input: HomeTodayPanelInput): HomeTodayPanelModel {
  const camps = (input.campaigns || []).slice(0, 3);
  return {
    primary: camps[0] ? campaignPrimary(camps[0]) : primaryFromInput(input),
    group: camps[1] ? campaignSide(camps[1]) : groupSlot(input),
    prayer: camps[2] ? campaignSide(camps[2]) : prayerSlot(input),
  };
}
