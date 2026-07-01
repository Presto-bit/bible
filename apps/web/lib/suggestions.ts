/** 智能推荐「下次读什么」（§7 P1） */

import { getLastRead } from './reading';
import { getActivePlan, getPlanDay } from './plan_progress';
import { readingStreak } from './gamification';

export interface ReadingSuggestion {
  title: string;
  reason: string;
  href: string;
}

export function nextReadingSuggestion(): ReadingSuggestion | null {
  const last = getLastRead();
  const active = getActivePlan();
  const streak = readingStreak();

  if (active && active.kind !== 'prayer') {
    const day = getPlanDay(active.planId) || 1;
    return {
      title: `${active.title} · 第 ${day} 天`,
      reason: '继续今日计划',
      href: '/plans',
    };
  }
  if (last) {
    return {
      title: `继续 ${last.bookId} ${last.chapter} 章`,
      reason: streak >= 3 ? `已连续 ${streak} 天` : '从上次位置继续',
      href: `/reader?book=${last.bookId}&chapter=${last.chapter}`,
    };
  }
  return {
    title: '从约翰福音开始',
    reason: '新手友好入门',
    href: '/reader?book=JHN&chapter=1',
  };
}
