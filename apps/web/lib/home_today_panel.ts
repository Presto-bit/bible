/** 首页「今日推荐」：固定四坑 2×2 —— 活动/书架 · 继续阅读 · 共读 · 探索 */

import type { RailIconId } from './home_rail';
import { bookIdFromReaderHref } from './book_cover';
import { trimRailSub, trimRailTitle } from './home_rail';
import { shelfBookCardHref } from './shelf_library';
import {
  DEFAULT_EXPLORE_SPOTLIGHT,
  manuscriptIdFromExploreHref,
  type ExploreSpotlight,
} from './explore_spotlight';
import { readManuscriptPage } from './manuscript_progress';

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
  /** 自定义封面（优先于 bookId 风景） */
  coverUrl?: string;
  /** 主卡 / 侧卡 CTA */
  cta?: string;
  /** 侧卡角标（如打卡 2/5） */
  badge?: string;
  /** 侧卡完成态（弱化） */
  done?: boolean;
  /** 侧卡待办强调 */
  pending?: boolean;
  /** 主卡进度 0–100 */
  progressPct?: number;
};

/** 固定四坑：[1] 活动/书架 [2] 继续阅读 [3] 共读 [4] 探索 */
export type HomeTodayPanelModel = {
  activity: HomeTodayPanelSlot;
  read: HomeTodayPanelSlot;
  group: HomeTodayPanelSlot;
  /** 第 4 坑：探索（原祷告） */
  explore: HomeTodayPanelSlot;
  /** @deprecated 兼容旧调用，等同 explore */
  prayer: HomeTodayPanelSlot;
};

export function homeTodayPanelSlots(model: HomeTodayPanelModel): HomeTodayPanelSlot[] {
  return [model.activity, model.read, model.group, model.explore];
}

export type HomeTodayCampaignInput = {
  id: string;
  tag: string;
  title: string;
  sub: string;
  href: string;
  /** 主卡封面书卷；有 coverUrl 时不用 */
  bookId?: string;
  /** 运营选择的系统/自定义封面，优先于 bookId */
  coverUrl?: string;
};

export type HomeTodayShelfInput = {
  bookId?: string;
  title: string;
  sub?: string;
  href: string;
  coverUrl?: string;
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
  /** 第 4 坑探索（随机专题缩写）；缺省用默认探索入口 */
  explore?: ExploreSpotlight;
  group?: {
    title: string;
    sub: string;
    href: string;
    statPct?: number;
    statLabel?: string;
  };
  suggest?: { title: string; sub: string; href: string; bookId?: string };
  /** 无活动时 [1] 坑书架回退数据 */
  shelf?: HomeTodayShelfInput;
  /** 运营活动，仅占用 [1] 活动坑；无活动时 [1] 为书架 */
  campaigns?: HomeTodayCampaignInput[];
  /** 今日计划日已完成（会话/进度） */
  planDoneToday?: boolean;
  /** 今日已有阅读分钟 */
  readToday?: boolean;
  /** 断签 ≥3 天召回 */
  welcomeBack?: boolean;
};

function campaignActivity(c: HomeTodayCampaignInput): HomeTodayPanelSlot {
  const action = trimRailSub(c.sub || '进入活动') || '进入活动';
  const tag = (c.tag || '').trim();
  const safeTag =
    !tag || tag === '空白' || tag === '空白页' || tag === '未命名' ? '活动' : tag;
  return {
    id: `campaign-${c.id}`,
    tag: safeTag,
    title: trimRailTitle(c.title),
    sub: '',
    href: c.href,
    icon: 'devotional',
    bookId: c.coverUrl ? undefined : c.bookId,
    coverUrl: c.coverUrl || undefined,
    cta: action,
  };
}

function activitySlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const camp = (input.campaigns || [])[0];
  if (camp) return campaignActivity(camp);
  return shelfSlot(input);
}

function shelfSlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const s = input.shelf;
  if (s) {
    return {
      id: 'shelf',
      tag: '书架',
      title: trimRailTitle(s.title),
      sub: trimRailSub(s.sub || ''),
      href: s.href || '/shelf',
      icon: 'notes',
      bookId: s.bookId,
      coverUrl: s.coverUrl,
      cta: s.bookId ? '继续' : '打开',
    };
  }
  return {
    id: 'shelf',
    tag: '书架',
    title: '打开书柜',
    sub: '灵修书与资料',
    href: '/shelf',
    icon: 'notes',
    cta: '打开',
  };
}

/**
 * [2] 继续阅读：仅圣经续读 / 自由读入口；读经计划留在成长区。
 */
function readSlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const readToday = Boolean(input.readToday);
  const welcomeBack = Boolean(input.welcomeBack);

  if (welcomeBack && !readToday && input.resume) {
    return {
      id: 'resume',
      tag: '欢迎回来',
      title: trimRailTitle(input.resume.title),
      sub: '',
      href: input.resume.href,
      icon: 'resume',
      bookId: input.resume.bookId,
      cta: '继续',
    };
  }

  if (input.resume) {
    return {
      id: 'resume',
      tag: '继续阅读',
      title: trimRailTitle(input.resume.title),
      sub: '',
      href: input.resume.href,
      icon: 'resume',
      bookId: input.resume.bookId,
      cta: readToday ? '再读' : '继续',
    };
  }

  const suggest = input.suggest;
  const bookId =
    suggest?.bookId ||
    (suggest ? bookIdFromReaderHref(suggest.href)?.bookId : undefined) ||
    'JHN';
  const freeHref =
    suggest?.href?.startsWith('/reader')
      ? suggest.href
      : '/reader?book=JHN&chapter=1';
  return {
    id: 'suggest',
    tag: '继续阅读',
    title: trimRailTitle(
      suggest?.href?.startsWith('/reader')
        ? suggest.title
        : '从约翰福音开始',
    ),
    sub: '',
    href: freeHref,
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

/** [3] 共读 */
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

/** [4] 探索：固定插图底；文案=专题短名+导语；点进专题详情 */
function exploreSlot(input: HomeTodayPanelInput): HomeTodayPanelSlot {
  const e = input.explore || DEFAULT_EXPLORE_SPOTLIGHT;
  const manuscriptId = manuscriptIdFromExploreHref(e.href || '');
  const resume = manuscriptId ? readManuscriptPage(manuscriptId) : 0;
  const media = (e.mediaBadge || '').trim();
  // 角标只放短信息；长导语走 sub，避免小徽章挤字
  let badge: string | undefined;
  if (resume > 0) badge = `续 · ${resume + 1}`;
  else if (media) badge = media;

  const hrefRaw = (e.href || '/knowledge').trim();
  const href =
    hrefRaw.includes('from=')
      ? hrefRaw
      : hrefRaw.includes('?')
        ? `${hrefRaw}&from=home`
        : `${hrefRaw}?from=home`;

  return {
    id: 'explore',
    tag: '探索',
    title: trimRailTitle(e.title || '探索手稿', SIDE_TITLE_MAX),
    sub: trimRailSub(e.hook || '彼爱手稿'),
    href,
    // 不用随机封面：固定 growth_theme 插图
    icon: 'discover',
    cta: resume > 0 ? '续读' : '去看看',
    badge,
  };
}

/**
 * 固定四坑 2×2：
 * [1] 活动（无则书架）· [2] 继续阅读 · [3] 共读 · [4] 探索
 */
export function buildHomeTodayPanel(input: HomeTodayPanelInput): HomeTodayPanelModel {
  const explore = exploreSlot(input);
  return {
    activity: activitySlot(input),
    read: readSlot(input),
    group: groupSlot(input),
    explore,
    prayer: explore,
  };
}

/** 从最近阅读构造书架坑输入（书名可选，无列表时仍可用 bookId 续读）。 */
export function buildHomeShelfTileInput(opts?: {
  bookId?: string | null;
  title?: string | null;
  sub?: string | null;
}): HomeTodayShelfInput {
  const bookId = opts?.bookId?.trim();
  if (bookId) {
    return {
      bookId,
      title: trimRailTitle(opts?.title?.trim() || '继续书柜阅读'),
      sub: trimRailSub(opts?.sub?.trim() || ''),
      href: shelfBookCardHref(bookId),
    };
  }
  return {
    title: '打开书柜',
    sub: '灵修书与资料',
    href: '/shelf',
  };
}
