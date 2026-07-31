/** 智能推荐「下次读什么」（§7 P1）
 * 首页主卡有计划时走计划；自由读建议用 nextFreeReadingSuggestion。
 */

import { getLastRead } from './reading';
import { getActivePlan, getPlanDay } from './plan_progress';
import { readingStreak } from './gamification';
import { bookIdToChineseName } from './ref_label';
import { activePlanTodayHrefSync } from './plan_today_href';

export interface ReadingSuggestion {
  title: string;
  reason: string;
  href: string;
}

/** 自由读建议（忽略进行中计划，留给首页主卡） */
export function nextFreeReadingSuggestion(): ReadingSuggestion {
  const last = getLastRead();
  const streak = readingStreak();
  if (last) {
    const bookName = bookIdToChineseName(last.bookId);
    return {
      title: `继续 ${bookName} ${last.chapter} 章`,
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

export function nextReadingSuggestion(): ReadingSuggestion | null {
  const active = getActivePlan();
  if (active) {
    const day = getPlanDay(active.planId) || 1;
    return {
      title: `${active.title} · 第 ${day} 天`,
      reason: '继续今日计划',
      href: activePlanTodayHrefSync(active),
    };
  }
  return nextFreeReadingSuggestion();
}
