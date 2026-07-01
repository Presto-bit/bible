/** 月/年度读经回顾（§22.3 Wrapped） */

import { dailyMinutes, rangeStats } from './reading';
import { readingStreak } from './gamification';
import { listNotes } from './notes';
import { loadFavoriteRefs } from './favorites';

export interface WrappedStats {
  period: 'month' | 'year';
  label: string;
  totalMinutes: number;
  activeDays: number;
  streak: number;
  notesCount: number;
  favoritesCount: number;
  highlight: string;
}

function periodRange(period: 'month' | 'year'): { start: number; end: number; label: string } {
  const now = new Date();
  if (period === 'year') {
    const y = now.getFullYear();
    return {
      start: new Date(y, 0, 1).getTime(),
      end: new Date(y + 1, 0, 1).getTime(),
      label: `${y} 年度回顾`,
    };
  }
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    start: new Date(y, m, 1).getTime(),
    end: new Date(y, m + 1, 1).getTime(),
    label: `${y} 年 ${m + 1} 月回顾`,
  };
}

export function buildWrapped(period: 'month' | 'year'): WrappedStats {
  const { start, end, label } = periodRange(period);
  const stats = rangeStats(start, end);
  const mins = dailyMinutes();
  let totalMinutes = 0;
  let activeDays = 0;
  for (const [date, m] of Object.entries(mins)) {
    const t = new Date(`${date}T00:00:00`).getTime();
    if (t >= start && t < end && m > 0) {
      totalMinutes += m;
      activeDays += 1;
    }
  }
  const streak = readingStreak();
  const notesCount = listNotes().filter((n) => n.updatedAt >= start && n.updatedAt < end).length;
  const favoritesCount = loadFavoriteRefs().length;
  const highlight =
    activeDays >= 20
      ? '你是持之以恒的读经伙伴'
      : activeDays >= 7
        ? '这个月你留下了稳定的足迹'
        : stats.chapters > 0
          ? `读了 ${stats.chapters} 章，每一步都算数`
          : '新的开始，从一节经文就好';

  return {
    period,
    label,
    totalMinutes,
    activeDays,
    streak,
    notesCount,
    favoritesCount,
    highlight,
  };
}
