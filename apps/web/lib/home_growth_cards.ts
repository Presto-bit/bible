/** 首页「成长与回忆」：动态积累与回看卡片（与横滑行动卡不重复） */

import { BADGE_SPECS } from './badge_catalog';
import { loadBadgeStats } from './badge_events';
import { readingStreak } from './gamification';
import { bookIdToChineseName } from './ref_label';
import { listAllThoughts } from './reader_thoughts';
import { buildReport, rangeStats, todayMinutes } from './reading';
import { PROFILE_BADGES_HREF } from './profile_settings';
import { buildWrapped } from './wrapped';

export type HomeGrowthCard = {
  id: string;
  tag: string;
  title: string;
  sub?: string;
  href: string;
  pillActive?: boolean;
  accent?: boolean;
};

const MAX_DYNAMIC = 3;
const TITLE_MAX = 28;
const SUB_MAX = 36;

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

function weekRangeMs(): { start: number; end: number } {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.getTime(), end: end.getTime() };
}

function latestBadgeUnlock(): { label: string; at: number } | null {
  const stats = loadBadgeStats();
  let best: { label: string; at: number } | null = null;
  for (const spec of BADGE_SPECS) {
    const at = stats.unlocked_at[spec.id];
    if (!at) continue;
    if (!best || at > best.at) best = { label: spec.label, at };
  }
  return best;
}

export function buildHomeGrowthCards(opts?: {
  todayMin?: number;
  monthDays?: number;
}): HomeGrowthCard[] {
  const report = buildReport();
  const todayMin = opts?.todayMin ?? todayMinutes();
  const monthDays = opts?.monthDays ?? report.monthDays;

  const cards: HomeGrowthCard[] = [
    {
      id: 'today',
      tag: '今日',
      title: `今日 ${todayMin} 分钟 · 本月已读 ${monthDays} 天`,
      href: '/report',
      pillActive: true,
    },
  ];

  type Cand = { card: HomeGrowthCard; score: number };
  const pool: Cand[] = [];

  const thought = listAllThoughts()[0];
  if (thought?.body?.trim()) {
    pool.push({
      score: 90,
      card: {
        id: 'note-excerpt',
        tag: '笔记',
        title: trimTitle(thought.ref, 18),
        sub: trimSub(thought.body),
        href: `/reader?ref=${encodeURIComponent(thought.ref)}`,
        pillActive: true,
      },
    });
  } else {
    pool.push({
      score: 40,
      card: {
        id: 'notes-empty',
        tag: '笔记',
        title: '记下你的想法',
        sub: '收藏与划线',
        href: '/notes',
      },
    });
  }

  const streak = readingStreak();
  if (streak >= 2) {
    pool.push({
      score: 72 + Math.min(streak, 18),
      card: {
        id: 'streak',
        tag: '连续',
        title: `已连续读经 ${streak} 天`,
        sub: streak >= 7 ? '持之以恒' : '保持节奏',
        href: '/profile',
        pillActive: true,
      },
    });
  }

  const badge = latestBadgeUnlock();
  const recentMs = 14 * 86400000;
  if (badge && Date.now() - badge.at < recentMs) {
    pool.push({
      score: 84,
      card: {
        id: 'badge-recent',
        tag: '成就',
        title: trimTitle(`解锁「${badge.label}」`, 22),
        href: PROFILE_BADGES_HREF,
        pillActive: true,
      },
    });
  } else if (badge) {
    pool.push({
      score: 48,
      card: {
        id: 'badge-latest',
        tag: '成就',
        title: trimTitle(badge.label, 20),
        sub: '查看全部徽章',
        href: PROFILE_BADGES_HREF,
      },
    });
  }

  const { start, end } = weekRangeMs();
  const week = rangeStats(start, end);
  if (week.days > 0 || week.chapters > 0) {
    const topBook = week.topBooks[0]?.key;
    pool.push({
      score: 56 + week.days * 5,
      card: {
        id: 'week-summary',
        tag: '本周',
        title: `读了 ${week.chapters} 章 · ${week.days} 天`,
        sub: topBook ? `常读 ${bookIdToChineseName(topBook)}` : undefined,
        href: '/report',
      },
    });
  }

  pool.push({
    score: monthDays > 0 ? 54 : 36,
    card: {
      id: 'month-review',
      tag: '回顾',
      title: `${new Date().getMonth() + 1} 月回顾`,
      sub: monthDays > 0 ? `本月已读 ${monthDays} 天` : '看看读经足迹',
      href: '/report',
    },
  });

  const now = new Date();
  const yearWrap = buildWrapped('year');
  const yearBoost = now.getMonth() === 11 || now.getMonth() === 0;
  if (yearBoost || yearWrap.activeDays >= 7) {
    pool.push({
      score: yearBoost ? 76 : 52 + Math.min(yearWrap.activeDays, 12),
      card: {
        id: 'year-wrapped',
        tag: '年度',
        title: `${now.getFullYear()} 年度回顾`,
        sub: trimSub(
          yearWrap.activeDays > 0 ? yearWrap.highlight : '回顾这一年的足迹',
        ),
        href: '/wrapped?period=year',
        accent: yearBoost,
      },
    });
  }

  pool.sort((a, b) => b.score - a.score);

  const used = new Set<string>(['today']);
  for (const c of pool) {
    if (cards.length >= 1 + MAX_DYNAMIC) break;
    if (used.has(c.card.id)) continue;
    used.add(c.card.id);
    cards.push(c.card);
  }

  return cards;
}
