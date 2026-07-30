/** 首页成长钩子：一行摘要（可轮换）+ 折叠线下最多 1 张记忆卡。不动今日经文 / 今日推荐。 */

import { seededBooks } from './bible_local';
import { listMarksDetailed } from './mark_stats';
import { parseMarkRef } from './mark_ref';
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
  sub?: string;
  href: string;
  pillActive?: boolean;
  accent?: boolean;
  /** 摘要行：无 pill、轻量 */
  kind?: 'summary' | 'memory';
};

export type HomeGrowthModel = {
  summary: HomeGrowthCard;
  memory: HomeGrowthCard | null;
};

const TITLE_MAX = 28;
const SUB_MAX = 36;
/** 剩余章数 ≤ 此值视为「就快读完」 */
const ALMOST_REMAINING_MAX = 3;
/** 书卷至少这么多章才提示「就快读完」（避免短书误触） */
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

function chapterSetsByBook(): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const e of readEvents()) {
    let set = map.get(e.book);
    if (!set) {
      set = new Set();
      map.set(e.book, set);
    }
    set.add(e.chapter);
  }
  return map;
}

function findAlmostDone(): AlmostDone | null {
  const books = seededBooks();
  const byBook = chapterSetsByBook();
  const last = getLastRead();
  const candidates: AlmostDone[] = [];

  for (const b of books) {
    if (b.chapter_count < ALMOST_MIN_CHAPTERS) continue;
    const read = byBook.get(b.id);
    if (!read?.size) continue;
    const remaining = b.chapter_count - read.size;
    if (remaining < 1 || remaining > ALMOST_REMAINING_MAX) continue;
    let nextChapter = b.chapter_count;
    for (let ch = 1; ch <= b.chapter_count; ch++) {
      if (!read.has(ch)) {
        nextChapter = ch;
        break;
      }
    }
    candidates.push({
      bookId: b.id,
      name: b.name || bookIdToChineseName(b.id) || b.id,
      remaining,
      nextChapter,
      href: `/reader?book=${b.id}&chapter=${nextChapter}`,
    });
  }

  if (!candidates.length) return null;
  if (last) {
    const hit = candidates.find((c) => c.bookId === last.bookId);
    if (hit) return hit;
  }
  candidates.sort((a, b) => a.remaining - b.remaining || a.name.localeCompare(b.name, 'zh'));
  return candidates[0];
}

type OnThisDay = {
  title: string;
  sub?: string;
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
      sub: '去年今日',
      href,
    };
  }

  const targetY = lastYear;
  const { m, day } = ymdParts(now);
  for (const e of readEvents()) {
    const d = new Date(e.ts);
    if (d.getFullYear() !== targetY || d.getMonth() !== m || d.getDate() !== day) continue;
    const name = bookIdToChineseName(e.book) || e.book;
    return {
      title: trimTitle(`你读了${name} ${e.chapter}章`),
      sub: '去年今日',
      href: `/reader?book=${e.book}&chapter=${e.chapter}`,
    };
  }
  return null;
}

/**
 * 构建首页成长区：
 * - summary：始终一行（可轮换里程碑文案）
 * - memory：有素材时最多 1 张；与 summary 同源钩子互斥
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

  type SummaryKind = 'almost' | 'month' | 'year' | 'default';
  let summaryKind: SummaryKind = 'default';
  let summary: HomeGrowthCard = {
    id: 'summary',
    kind: 'summary',
    tag: '今日',
    title: `今日 ${todayMin} 分钟 · 本月已读 ${monthDays} 天`,
    href: '/report',
  };

  if (almost) {
    summaryKind = 'almost';
    summary = {
      id: 'summary-almost',
      kind: 'summary',
      tag: '今日',
      title: trimTitle(
        `${almost.name}还剩 ${almost.remaining} 章 · 今日 ${todayMin} 分钟`,
      ),
      href: almost.href,
    };
  } else if (monthWindow && monthDays > 0) {
    summaryKind = 'month';
    summary = {
      id: 'summary-month',
      kind: 'summary',
      tag: '今日',
      title: trimTitle(
        `${now.getMonth() + 1} 月回顾可生成 · 已读 ${monthDays} 天`,
      ),
      href: '/report',
    };
  } else if (yearWindow && yearWrap.activeDays >= 7) {
    summaryKind = 'year';
    summary = {
      id: 'summary-year',
      kind: 'summary',
      tag: '今日',
      title: trimTitle(`${now.getFullYear()} 年度回顾 · 已读 ${yearWrap.activeDays} 天`),
      href: '/wrapped?period=year',
    };
  }

  type Cand = { card: HomeGrowthCard; score: number };
  const pool: Cand[] = [];

  if (onThisDay) {
    pool.push({
      score: 95,
      card: {
        id: 'on-this-day',
        kind: 'memory',
        tag: '去年今日',
        title: onThisDay.title,
        sub: onThisDay.sub === '去年今日' ? undefined : onThisDay.sub,
        href: onThisDay.href,
        pillActive: true,
      },
    });
  }

  if (almost && summaryKind !== 'almost') {
    pool.push({
      score: 88,
      card: {
        id: 'almost-done',
        kind: 'memory',
        tag: '就快读完',
        title: trimTitle(`${almost.name}还剩 ${almost.remaining} 章就读完啦`),
        href: almost.href,
        pillActive: true,
        accent: true,
      },
    });
  }

  if (yearWindow && yearWrap.activeDays >= 7 && summaryKind !== 'year') {
    pool.push({
      score: 80,
      card: {
        id: 'year-wrapped',
        kind: 'memory',
        tag: '年度',
        title: trimTitle(yearWrap.label),
        sub: trimSub(yearWrap.highlight),
        href: '/wrapped?period=year',
        accent: true,
        pillActive: true,
      },
    });
  } else if (
    !yearWindow &&
    yearWrap.activeDays >= 30 &&
    now.getMonth() >= 10
  ) {
    pool.push({
      score: 55,
      card: {
        id: 'year-wrapped-soft',
        kind: 'memory',
        tag: '年度',
        title: trimTitle(`${now.getFullYear()} 年度回顾`),
        sub: trimSub(yearWrap.highlight),
        href: '/wrapped?period=year',
      },
    });
  }

  if (monthWindow && monthDays > 0 && summaryKind !== 'month') {
    pool.push({
      score: 70,
      card: {
        id: 'month-review',
        kind: 'memory',
        tag: '回顾',
        title: trimTitle(`${now.getMonth() + 1} 月回顾`),
        sub: `本月已读 ${monthDays} 天`,
        href: '/report',
        pillActive: true,
      },
    });
  }

  pool.sort((a, b) => b.score - a.score);
  const memory = pool[0]?.card ?? null;

  return { summary, memory };
}

/** @deprecated 兼容旧调用：返回 [摘要, …记忆] */
export function buildHomeGrowthCards(opts?: {
  todayMin?: number;
  monthDays?: number;
}): HomeGrowthCard[] {
  const model = buildHomeGrowthModel(opts);
  return model.memory ? [model.summary, model.memory] : [model.summary];
}
