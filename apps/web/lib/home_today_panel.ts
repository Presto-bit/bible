/** 首页「今日推荐」：左大（主行动）+ 右双（共读 / 祷告） */

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
  /** 主卡右下角轻 CTA，如「继续 ›」 */
  cta?: string;
};

export type HomeTodayPanelModel = {
  primary: HomeTodayPanelSlot;
  group: HomeTodayPanelSlot;
  prayer: HomeTodayPanelSlot;
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
};

function primaryFromInput(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  if (input.plan) {
    return {
      id: 'plan',
      tag: '计划',
      title: trimRailTitle(input.plan.title),
      sub: trimRailSub(input.plan.sub || '今日计划'),
      href: input.plan.href,
      icon: 'plan',
      bookId: input.plan.bookId,
      cta: '继续 ›',
    };
  }
  if (input.resume) {
    return {
      id: 'resume',
      tag: '继续',
      title: trimRailTitle(input.resume.title),
      sub: trimRailSub(input.resume.sub || '继续阅读'),
      href: input.resume.href,
      icon: 'resume',
      bookId: input.resume.bookId,
      cta: '继续 ›',
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
    sub: trimRailSub(suggest?.sub || '新手友好入门'),
    href: suggest?.href || '/reader?book=JHN&chapter=1',
    icon: 'suggest',
    bookId,
    cta: '去读 ›',
  };
}

function groupSlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const g = input.group;
  return {
    id: 'group',
    tag: '共读',
    title: trimRailTitle(g?.title || '邀请好友共读', 16),
    sub: trimRailSub(g?.sub || '创建或加入', 12),
    href: g?.href || '/discover',
    icon: 'group',
  };
}

function prayerSlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const p = input.prayer;
  return {
    id: 'prayer',
    tag: '祷告',
    title: trimRailTitle(p?.title || '今日祷告', 16),
    sub: trimRailSub(p?.sub || '安静片刻', 12),
    href: p?.href || '/plans',
    icon: 'prayer',
  };
}

/** 固定三坑：主行动 | 共读 | 祷告（不与每日经文 Hero 抢沉浸感） */
export function buildHomeTodayPanel(input: HomeTodayPanelInput): HomeTodayPanelModel {
  return {
    primary: primaryFromInput(input),
    group: groupSlot(input),
    prayer: prayerSlot(input),
  };
}
