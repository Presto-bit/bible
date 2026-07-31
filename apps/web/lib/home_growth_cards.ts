/** 首页成长钩子：摘要主行锁定进度 + 可选副行里程碑 + ≤1 记忆卡。 */

import { seededBooks } from './bible_local';
import { listMarksDetailed } from './mark_stats';
import { parseMarkRef } from './mark_ref';
import {
  homeMediaDaySeed,
  homeMediaIconForTone,
  homeMediaMemoryImageUrl,
  homeMediaMonthProgressPct,
  homeMediaSceneUrl,
  type HomeMediaIconId,
  type HomeMediaTone,
} from './home_media_visual';
import { bookIdToChineseName, refToChineseLabel } from './ref_label';
import {
  buildReport,
  getLastRead,
  readEvents,
  todayMinutes,
} from './reading';
import { buildWrapped } from './wrapped';

export type HomeGrowthCard = {
  id: string;
  tag: string;
  title: string;
  /** 右栏辅文（如本月天数） */
  detail?: string;
  /** 摘要数字强调 */
  metric?: { prefix?: string; value: string; suffix?: string };
  /** 摘要副行里程碑（仅 summary，独立热区） */
  sub?: string;
  /** 副行点击（默认同 href） */
  subHref?: string;
  href: string;
  pillActive?: boolean;
  accent?: boolean;
  kind?: 'summary' | 'memory';
  mediaTone: HomeMediaTone;
  icon: HomeMediaIconId;
  imageUrl?: string | null;
  progressPct?: number;
};

export type HomeGrowthModel = {
  summary: HomeGrowthCard;
  memory: HomeGrowthCard | null;
};

const TITLE_MAX = 28;
const SUB_MAX = 36;
const ALMOST_REMAINING_MAX = 3;
const ALMOST_MIN_CHAPTERS = 4;

function trimTitle(text: string, max = TITLE_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function trimSub(text: string, max = SUB_MAX): string {
  const t = text.trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function ymdParts(d: Date): { y: number; m: number; day: number } {
  return { y: d.getFullYear(), m: d.getMonth(), day: d.getDate() };
}

function isSameMonthDay(a: Date, b: Date): boolean {
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isMonthReviewWindow(now = new Date()): boolean {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() >= lastDay - 2;
}

/** 仅 12 / 1 月（U10） */
function isYearReviewWindow(now = new Date()): boolean {
  const m = now.getMonth();
  return m === 11 || m === 0;
}

type AlmostDone = {
  bookId: string;
  name: string;
  remaining: number;
  nextChapter: number;
  href: string;
};

/**
 * 就快读完（L1/L2）：当前阅读卷；1…current 无空洞；
 * remaining = total - current 且 1…3；跳转 current+1。
 */
function findAlmostDone(): AlmostDone | null {
  const last = getLastRead();
  if (!last) return null;
  const book = seededBooks().find((b) => b.id === last.bookId);
  if (!book || book.chapter_count < ALMOST_MIN_CHAPTERS) return null;

  const read = new Set<number>();
  for (const e of readEvents()) {
    if (e.book === last.bookId) read.add(e.chapter);
  }
  // 至少读到 last.chapter
  read.add(last.chapter);

  const current = last.chapter;
  if (current < 1 || current >= book.chapter_count) return null;

  for (let ch = 1; ch <= current; ch++) {
    if (!read.has(ch)) return null; // 有空洞则不出
  }

  const remaining = book.chapter_count - current;
  if (remaining < 1 || remaining > ALMOST_REMAINING_MAX) return null;

  const nextChapter = current + 1;
  const name = book.name || bookIdToChineseName(book.id) || book.id;
  return {
    bookId: book.id,
    name,
    remaining,
    nextChapter,
    href: `/reader?book=${book.id}&chapter=${nextChapter}`,
  };
}

type OnThisDay = {
  title: string;
  href: string;
};

function findOnThisDayLastYear(): OnThisDay | null {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;

  const marks = listMarksDetailed().filter((m) => {
    if (!m.createdAt) return false;
    const d = new Date(m.createdAt);
    return d.getFullYear() === lastYear && isSameMonthDay(d, now);
  });
  if (marks.length) {
    const m = marks[0];
    const label = refToChineseLabel(m.ref) || m.ref;
    const parsed = parseMarkRef(m.ref);
    const href = parsed
      ? `/reader?book=${parsed.bookId}&chapter=${parsed.chapter}`
      : '/notes';
    return {
      title: trimTitle(`${label}${m.notePreview ? ' · 还留下想法' : ' · 你划了线'}`),
      href,
    };
  }

  const { m, day } = ymdParts(now);
  for (const e of readEvents()) {
    const d = new Date(e.ts);
    if (d.getFullYear() !== lastYear || d.getMonth() !== m || d.getDate() !== day) {
      continue;
    }
    const name = bookIdToChineseName(e.book) || e.book;
    return {
      title: trimTitle(`你读了${name} ${e.chapter}章`),
      href: `/reader?book=${e.book}&chapter=${e.chapter}`,
    };
  }
  return null;
}

/**
 * - summary 主行锁定今日进度；副行可选里程碑
 * - memory ≤1；与副行情绪互斥（L4）
 */
export function buildHomeGrowthModel(opts?: {
  todayMin?: number;
  monthDays?: number;
}): HomeGrowthModel {
  const report = buildReport();
  const todayMin = opts?.todayMin ?? todayMinutes();
  const monthDays = opts?.monthDays ?? report.monthDays;
  const now = new Date();
  const almost = findAlmostDone();
  const onThisDay = findOnThisDayLastYear();
  const yearWrap = buildWrapped('year');
  const yearWindow = isYearReviewWindow(now);
  const monthWindow = isMonthReviewWindow(now);

  type MilestoneKind = 'almost' | 'month' | 'year' | null;
  let milestoneKind: MilestoneKind = null;

  const daySeed = homeMediaDaySeed(now);
  const summary: HomeGrowthCard = {
    id: 'summary',
    kind: 'summary',
    tag: '今日',
    title: `今日 ${todayMin} 分钟`,
    detail: `本月已读 ${monthDays} 天`,
    metric: {
      prefix: '今日',
      value: String(todayMin),
      suffix: '分钟',
    },
    href: '/report',
    mediaTone: 'summary',
    icon: homeMediaIconForTone('summary'),
    progressPct: homeMediaMonthProgressPct(monthDays, now),
  };

  // 副行优先级：就快读完 > 月末 > 年末（R2）
  if (almost) {
    milestoneKind = 'almost';
    summary.sub = trimSub(`${almost.name}还剩 ${almost.remaining} 章 · 读完它`);
    summary.subHref = almost.href;
  } else if (monthWindow && monthDays > 0) {
    milestoneKind = 'month';
    // U6/L5：报告浏览口径，不用「可生成」
    summary.sub = trimSub(`${now.getMonth() + 1} 月足迹 · 已读 ${monthDays} 天`);
    summary.subHref = '/report';
  } else if (yearWindow && yearWrap.activeDays >= 7) {
    milestoneKind = 'year';
    summary.sub = trimSub(`生成 ${now.getFullYear()} 年度回顾`);
    summary.subHref = '/wrapped?period=year';
  }

  type Cand = { card: HomeGrowthCard; score: number };
  const pool: Cand[] = [];

  // L4：副行已有 almost 时不再出记忆情绪卡
  const allowMemory = milestoneKind !== 'almost';

  if (allowMemory && onThisDay) {
    pool.push({
      score: 95,
      card: {
        id: 'on-this-day',
        kind: 'memory',
        tag: '去年今日',
        title: onThisDay.title,
        href: onThisDay.href,
        pillActive: true,
        mediaTone: 'memory',
        icon: homeMediaIconForTone('memory'),
        imageUrl: homeMediaMemoryImageUrl(onThisDay.href, 'memory', daySeed),
      },
    });
  }

  // 就快读完只走副行，不再进记忆卡（避免双份）
  if (allowMemory && yearWindow && yearWrap.activeDays >= 7 && milestoneKind !== 'year') {
    pool.push({
      score: 80,
      card: {
        id: 'year-wrapped',
        kind: 'memory',
        tag: '年度',
        title: trimTitle(`生成 ${yearWrap.label}`),
        detail: trimSub(yearWrap.highlight),
        href: '/wrapped?period=year',
        pillActive: true,
        mediaTone: 'review',
        icon: 'spark',
        imageUrl: homeMediaSceneUrl('review', daySeed),
      },
    });
  }

  if (allowMemory && monthWindow && monthDays > 0 && milestoneKind !== 'month') {
    pool.push({
      score: 70,
      card: {
        id: 'month-review',
        kind: 'memory',
        tag: '回顾',
        title: trimTitle(`看 ${now.getMonth() + 1} 月足迹`),
        detail: `本月已读 ${monthDays} 天`,
        href: '/report',
        pillActive: true,
        mediaTone: 'review',
        icon: homeMediaIconForTone('review'),
        imageUrl: homeMediaSceneUrl('review', daySeed + 3),
      },
    });
  }

  pool.sort((a, b) => b.score - a.score);
  const memory = pool[0]?.card ?? null;

  return { summary, memory };
}

/** @deprecated */
export function buildHomeGrowthCards(opts?: {
  todayMin?: number;
  monthDays?: number;
}): HomeGrowthCard[] {
  const model = buildHomeGrowthModel(opts);
  return model.memory ? [model.summary, model.memory] : [model.summary];
}
