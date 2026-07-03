/** 计划模式翻页：仅在当日 Step 章节序列内导航。 */

import type { BibleBook } from './api';
import type { PlanStep } from './plan_steps';
import type { ReaderLocation } from './reader_navigation';

export type PlanChapterRef = { bookId: string; chapter: number; stepId: string };

export function flattenPlanChapters(steps: PlanStep[]): PlanChapterRef[] {
  const out: PlanChapterRef[] = [];
  for (const step of steps) {
    for (let ch = step.chapterStart; ch <= step.chapterEnd; ch += 1) {
      out.push({ bookId: step.bookId.toUpperCase(), chapter: ch, stepId: step.id });
    }
  }
  return out;
}

export function isChapterInPlan(steps: PlanStep[], bookId: string, chapter: number): boolean {
  const bid = bookId.toUpperCase();
  return steps.some(
    (s) => s.bookId === bid && chapter >= s.chapterStart && chapter <= s.chapterEnd,
  );
}

export function allowedChaptersForBook(steps: PlanStep[], bookId: string): number[] {
  const bid = bookId.toUpperCase();
  const set = new Set<number>();
  for (const s of steps) {
    if (s.bookId !== bid) continue;
    for (let ch = s.chapterStart; ch <= s.chapterEnd; ch += 1) set.add(ch);
  }
  return [...set].sort((a, b) => a - b);
}

export function planBooksInSteps(steps: PlanStep[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of steps) {
    if (!seen.has(s.bookId)) {
      seen.add(s.bookId);
      out.push(s.bookId);
    }
  }
  return out;
}

function planIndex(flat: PlanChapterRef[], loc: ReaderLocation): number {
  const bid = loc.bookId.toUpperCase();
  return flat.findIndex((c) => c.bookId === bid && c.chapter === loc.chapter);
}

export function resolvePlanNav(
  books: BibleBook[],
  steps: PlanStep[],
  current: ReaderLocation,
  delta: number,
): { book: BibleBook; chapter: number } | null {
  if (!delta || !steps.length) return null;
  const flat = flattenPlanChapters(steps);
  if (!flat.length) return null;
  const idx = planIndex(flat, current);
  if (idx < 0) return null;
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= flat.length) return null;
  const target = flat[nextIdx];
  const book = books.find((b) => b.id === target.bookId);
  if (!book) return null;
  return { book, chapter: target.chapter };
}

export function canPlanNav(
  books: BibleBook[],
  steps: PlanStep[],
  current: ReaderLocation,
  delta: number,
): boolean {
  return resolvePlanNav(books, steps, current, delta) !== null;
}

export type PlanNavGuard = {
  shouldConfirmForward: (
    from: { bookId: string; chapter: number },
    target: { bookId: string; chapter: number },
  ) => boolean;
  onForwardBoundary: (
    target: { bookId: string; chapter: number },
    proceed: () => void,
  ) => void;
};

/** 向前翻页是否跨 Step 边界（需确认再继续）。 */
export function isForwardStepBoundary(
  steps: PlanStep[],
  current: ReaderLocation,
  target: ReaderLocation,
): boolean {
  const flat = flattenPlanChapters(steps);
  const from = planIndex(flat, current);
  const to = planIndex(flat, target);
  if (from < 0 || to < 0 || to !== from + 1) return false;
  return flat[from].stepId !== flat[to].stepId;
}

export function stepLabelForLocation(steps: PlanStep[], loc: ReaderLocation): string | null {
  const bid = loc.bookId.toUpperCase();
  const step = steps.find(
    (s) => s.bookId === bid && loc.chapter >= s.chapterStart && loc.chapter <= s.chapterEnd,
  );
  return step?.label ?? null;
}
