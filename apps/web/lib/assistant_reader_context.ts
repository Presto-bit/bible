/** 小爱请求附带：读者本地灵修上下文（local-first，仅注入 prompt） */

import { listNotes } from './notes';
import { getActivePlan } from './plan_progress';
import { getLastRead, todayMinutes } from './reading';
import { readingStreak } from './gamification';
import { bookIdToChineseName } from './ref_label';
import type { ChatReaderContext } from './api';

export function buildAssistantReaderContext(): ChatReaderContext | undefined {
  if (typeof window === 'undefined') return undefined;

  const ctx: ChatReaderContext = {};
  const last = getLastRead();
  if (last) {
    const book = bookIdToChineseName(last.bookId);
    ctx.last_read_label = `${book} ${last.chapter}:${last.verse}`;
  }

  const streak = readingStreak();
  if (streak > 0) ctx.reading_streak = streak;

  const mins = todayMinutes();
  if (mins > 0) ctx.today_reading_minutes = mins;

  const plan = getActivePlan();
  if (plan?.title) ctx.active_plan_title = plan.title;

  const notes = listNotes()
    .filter((n) => !n.deleted && n.body.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 2)
    .map((n) => {
      const body = n.body.replace(/\s+/g, ' ').trim().slice(0, 80);
      const ref = n.ref ? `（${n.ref}）` : '';
      return `${body}${body.length >= 80 ? '…' : ''}${ref}`;
    });
  if (notes.length) ctx.recent_note_snippets = notes;

  return Object.keys(ctx).length ? ctx : undefined;
}
