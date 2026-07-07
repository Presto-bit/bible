/** 小爱请求附带：读者本地灵修上下文（local-first，仅注入 prompt） */

import { listAllThoughts } from './reader_thoughts';
import { getActivePlan } from './plan_progress';
import {
  getChapterVerseRange,
  getLastRead,
  getLastReadVerse,
  todayMinutes,
} from './reading';
import { readingStreak } from './gamification';
import { bookIdToChineseName } from './ref_label';
import type { ChatReaderContext } from './api';

export function buildAssistantReaderContext(): ChatReaderContext | undefined {
  if (typeof window === 'undefined') return undefined;

  const ctx: ChatReaderContext = {};
  const last = getLastRead();
  if (last) {
    const book = bookIdToChineseName(last.bookId);
    const verse = getLastReadVerse(last.bookId, last.chapter);
    const range = getChapterVerseRange(last.bookId, last.chapter);
    if (verse) {
      ctx.last_read_label = `${book} ${last.chapter}:${verse}`;
    } else if (range) {
      ctx.last_read_label = `${book} ${last.chapter}:${range.max}`;
    } else {
      ctx.last_read_label = `${book} 第 ${last.chapter} 章`;
    }
  }

  const streak = readingStreak();
  if (streak > 0) ctx.reading_streak = streak;

  const mins = todayMinutes();
  if (mins > 0) ctx.today_reading_minutes = mins;

  const plan = getActivePlan();
  if (plan?.title) ctx.active_plan_title = plan.title;

  const snippets = listAllThoughts()
    .slice(0, 2)
    .map((t) => {
      const body = t.body.replace(/\s+/g, ' ').trim().slice(0, 80);
      const ref = t.ref ? `（${t.ref}）` : '';
      return `${body}${body.length >= 80 ? '…' : ''}${ref}`;
    });
  if (snippets.length) ctx.recent_note_snippets = snippets;

  return Object.keys(ctx).length ? ctx : undefined;
}
