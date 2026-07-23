/** 首页「今日推荐」：左大 + 右双；活动优先占用最多 3 个坑位 */

import type { RailIconId } from './home_rail';
import { bookIdFromReaderHref } from './book_cover';
import { trimRailSub, trimRailTitle } from './home_rail';

export type HomeTodayPanelSlot = {
  id: string;
  tag: string;
  title: string;
  sub: string;
  href: string;
  icon: RailIconId;
  bookId?: string;
  /** 主卡右下角 CTA */
  cta?: string;
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
    title: trimRailTitle(c.title, 18),
    sub: '',
    href: c.href,
    icon: 'devotional',
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

/** 共读：一行状态句，避免「共读」标签与标题重复 */
function groupSlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const g = input.group;
  if (!g?.title) {
    return {
      id: 'group',
      tag: '共读',
      title: '邀请好友共读',
      sub: '',
      href: g?.href || '/discover',
      icon: 'group',
    };
  }
  const name = (g.sub || '').trim();
  const status = g.title.trim();
  let title = status;
  if (status === '今日待打卡' && name) title = `${name} · 待打卡`;
  else if (/^\d+ 个任务$/.test(status) && name) title = `${name} · ${status}`;
  else if (status === '今日共读已完成') title = '今日共读已完成';
  else if (name === '今日已打卡') title = `${status} · 已打卡`;
  else if (name === '看看动态') title = status;
  else if (name === '创建或加入') title = '邀请好友共读';
  else if (name && name !== status && !status.includes(name)) {
    title = `${name} · ${status}`;
  }
  return {
    id: 'group',
    tag: '共读',
    title: trimRailTitle(title, 18),
    sub: '',
    href: g.href || '/discover',
    icon: 'group',
  };
}

/** 祷告：一行状态句 */
function prayerSlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const p = input.prayer;
  if (!p) {
    return {
      id: 'prayer',
      tag: '祷告',
      title: '安静片刻',
      sub: '',
      href: '/plans',
      icon: 'prayer',
    };
  }
  const day = (p.title || '').trim();
  const planName = (p.sub || '').trim();
  let title = '今日祷告';
  if (planName && day) title = `${planName} · ${day}`;
  else if (day) title = day;
  else if (planName) title = planName;
  return {
    id: 'prayer',
    tag: '祷告',
    title: trimRailTitle(title, 18),
    sub: '',
    href: p.href || '/plans',
    icon: 'prayer',
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
