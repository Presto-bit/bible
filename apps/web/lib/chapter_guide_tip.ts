/** 章导读轻提示：按阅读意图出条，不按「每换一章」出。 */

import { getCachedChapterSummary } from './bible_summary';

const SEEN_KEY = 'chapter_guide_seen_v1';
const DAY_KEY = 'chapter_guide_day_v1';
const BOOK_DAY_KEY = 'chapter_guide_book_day_v1';
const DISABLED_KEY = 'chapter_guide_disabled_v1';
const SESSION_SKIP_KEY = 'chapter_guide_session_skip_v1';
const SESSION_SHOWN_KEY = 'chapter_guide_session_shown_v1';

/** 每日自动提示上限 */
const DAILY_MAX = 3;
/** 同一次 App 会话最多自动出条次数 */
const SESSION_MAX = 1;
/** 停留多久视为「在读」意图（毫秒） */
export const CHAPTER_GUIDE_DWELL_MS = 8_000;

export type ChapterGuideNavKind = 'swipe' | 'adjacent' | 'jump';
export type ChapterGuideIntent = 'jump' | 'dwell';

type DayState = { day: string; count: number };
type BookDayState = { day: string; books: Record<string, 1> };

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function chapterKey(bookId: string, chapter: number): string {
  return `${bookId.toUpperCase()}.${chapter}`;
}

function bookKey(bookId: string): string {
  return bookId.toUpperCase();
}

function readSeen(): Record<string, 1> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, 1>;
  } catch {
    return {};
  }
}

function writeSeen(map: Record<string, 1>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function readDay(): DayState {
  if (typeof window === 'undefined') return { day: todayKey(), count: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(DAY_KEY) || 'null') as DayState | null;
    const day = todayKey();
    if (!raw || raw.day !== day) return { day, count: 0 };
    return { day, count: Math.max(0, Number(raw.count) || 0) };
  } catch {
    return { day: todayKey(), count: 0 };
  }
}

function writeDay(state: DayState) {
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function readBookDay(): BookDayState {
  if (typeof window === 'undefined') return { day: todayKey(), books: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(BOOK_DAY_KEY) || 'null') as BookDayState | null;
    const day = todayKey();
    if (!raw || raw.day !== day) return { day, books: {} };
    return { day, books: raw.books && typeof raw.books === 'object' ? raw.books : {} };
  } catch {
    return { day: todayKey(), books: {} };
  }
}

function writeBookDay(state: BookDayState) {
  try {
    localStorage.setItem(BOOK_DAY_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function readSessionSkip(): Record<string, 1> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_SKIP_KEY) || '{}') as Record<string, 1>;
  } catch {
    return {};
  }
}

function writeSessionSkip(map: Record<string, 1>) {
  try {
    sessionStorage.setItem(SESSION_SKIP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function readSessionShown(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return Math.max(0, Number(sessionStorage.getItem(SESSION_SHOWN_KEY) || 0) || 0);
  } catch {
    return 0;
  }
}

function writeSessionShown(n: number) {
  try {
    sessionStorage.setItem(SESSION_SHOWN_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export function isChapterGuideAutoDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function disableChapterGuideAuto(): void {
  try {
    localStorage.setItem(DISABLED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function hasSeenChapterGuide(bookId: string, chapter: number): boolean {
  return Boolean(readSeen()[chapterKey(bookId, chapter)]);
}

export function markChapterGuideSeen(bookId: string, chapter: number): void {
  const map = readSeen();
  map[chapterKey(bookId, chapter)] = 1;
  writeSeen(map);
}

export function hasBookGuideTippedToday(bookId: string): boolean {
  return Boolean(readBookDay().books[bookKey(bookId)]);
}

export function markBookGuideTippedToday(bookId: string): void {
  const state = readBookDay();
  state.books[bookKey(bookId)] = 1;
  writeBookDay(state);
}

export function skipChapterGuideThisSession(bookId: string, chapter: number): void {
  const map = readSessionSkip();
  map[chapterKey(bookId, chapter)] = 1;
  writeSessionSkip(map);
}

export function isChapterGuideSkippedThisSession(bookId: string, chapter: number): boolean {
  return Boolean(readSessionSkip()[chapterKey(bookId, chapter)]);
}

/**
 * 由导航方式推断意图相关的 navKind。
 * - swipe：手势连翻 → 仅 dwell
 * - adjacent：同卷 ±1（含底栏翻章）→ 仅 dwell
 * - jump：开卷 / 换卷 / 跳章 / 计划落点 → 可即时提示
 */
export function resolveChapterGuideNavKind(opts: {
  fromSwipe: boolean;
  prevBookId: string | null;
  prevChapter: number | null;
  bookId: string;
  chapter: number;
}): ChapterGuideNavKind {
  if (opts.fromSwipe) return 'swipe';
  if (!opts.prevBookId || opts.prevChapter == null) return 'jump';
  if (opts.prevBookId.toUpperCase() !== opts.bookId.toUpperCase()) return 'jump';
  if (Math.abs(opts.chapter - opts.prevChapter) !== 1) return 'jump';
  return 'adjacent';
}

function passesCommonGates(bookId: string, chapter: number): boolean {
  if (typeof window === 'undefined') return false;
  if (isChapterGuideAutoDisabled()) return false;
  if (!bookId || chapter < 1) return false;
  if (isChapterGuideSkippedThisSession(bookId, chapter)) return false;
  if (readSessionShown() >= SESSION_MAX) return false;
  if (readDay().count >= DAILY_MAX) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (!getCachedChapterSummary(bookId, chapter)) return false;
  }
  return true;
}

/**
 * 是否应自动展示章导读轻提示（按意图，不按换章）。
 *
 * - jump：今日该卷第一次「跳入」（目录/计划/换卷/大跳）才即时出
 * - dwell：停留够久、像在读；该章尚未提示过
 * - 连翻 / 邻章翻页：不走即时，只靠 dwell
 */
export function shouldShowChapterGuideTip(opts: {
  bookId: string;
  chapter: number;
  intent: ChapterGuideIntent;
}): boolean {
  const { bookId, chapter, intent } = opts;
  if (!passesCommonGates(bookId, chapter)) return false;

  if (intent === 'jump') {
    // 同卷今日已提示过 → 不再因跳章连弹
    return !hasBookGuideTippedToday(bookId);
  }

  // dwell：真在读才提醒；已提示过的章不再出
  if (hasSeenChapterGuide(bookId, chapter)) return false;
  return true;
}

/** 真正展示提示时记账 */
export function recordChapterGuideTipShown(bookId: string, chapter: number): void {
  markChapterGuideSeen(bookId, chapter);
  markBookGuideTippedToday(bookId);
  const day = readDay();
  writeDay({ day: day.day, count: day.count + 1 });
  writeSessionShown(readSessionShown() + 1);
}

export {
  DAILY_MAX as CHAPTER_GUIDE_DAILY_MAX,
  SESSION_MAX as CHAPTER_GUIDE_SESSION_MAX,
};
