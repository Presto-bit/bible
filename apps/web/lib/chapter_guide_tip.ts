/** 章导读轻提示：本地频控与「已看过」记录（无设置页）。 */

import { getCachedChapterSummary } from './bible_summary';

const SEEN_KEY = 'chapter_guide_seen_v1';
const DAY_KEY = 'chapter_guide_day_v1';
const DISABLED_KEY = 'chapter_guide_disabled_v1';
const SESSION_SKIP_KEY = 'chapter_guide_session_skip_v1';
const DAILY_MAX = 5;

type DayState = { day: string; count: number };

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function chapterKey(bookId: string, chapter: number): string {
  return `${bookId.toUpperCase()}.${chapter}`;
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

export function skipChapterGuideThisSession(bookId: string, chapter: number): void {
  const map = readSessionSkip();
  map[chapterKey(bookId, chapter)] = 1;
  writeSessionSkip(map);
}

export function isChapterGuideSkippedThisSession(bookId: string, chapter: number): boolean {
  return Boolean(readSessionSkip()[chapterKey(bookId, chapter)]);
}

/**
 * 是否应展示章导读轻提示。
 * - 首次进入该章，或目录/计划等跳跃进入
 * - 连翻滑动：仅当该章从未提示过，且未超每日上限
 * - 全局「不再提示」后永不自动出现
 */
export function shouldShowChapterGuideTip(opts: {
  bookId: string;
  chapter: number;
  /** 滑动连翻为 true；目录/选章/按钮跳转为 false */
  fromContinuousSwipe: boolean;
}): boolean {
  if (typeof window === 'undefined') return false;
  if (isChapterGuideAutoDisabled()) return false;
  const { bookId, chapter, fromContinuousSwipe } = opts;
  if (!bookId || chapter < 1) return false;
  if (isChapterGuideSkippedThisSession(bookId, chapter)) return false;

  // 离线且无本地/种子导读 → 不出条
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (!getCachedChapterSummary(bookId, chapter)) return false;
  }

  const firstVisit = !hasSeenChapterGuide(bookId, chapter);
  if (!firstVisit) return false;

  const day = readDay();
  if (day.count >= DAILY_MAX) return false;

  // 连翻与跳跃共用「每章首次 + 每日上限」；连翻由 UI 用更弱胶囊呈现
  void fromContinuousSwipe;
  return true;
}

/** 真正展示提示时记账（计入每日次数 + 标记已看） */
export function recordChapterGuideTipShown(bookId: string, chapter: number): void {
  markChapterGuideSeen(bookId, chapter);
  const day = readDay();
  writeDay({ day: day.day, count: day.count + 1 });
}

export { DAILY_MAX as CHAPTER_GUIDE_DAILY_MAX };
