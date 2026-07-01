// 闯关进度与读完卷弱推送

import {
  allChallengeLevels,
  bookChallengeLevel,
  type ChallengeLevel,
} from './challenge_levels';

const LEVEL_PROGRESS_KEY = 'presto_challenge_level_progress';
const PENDING_BOOK_KEY = 'presto_pending_book_challenge';
const PUSHED_BOOKS_KEY = 'presto_book_challenge_pushed';

export type LevelProgress = Record<string, { done: boolean; correct: number; total: number }>;

export function levelProgress(): LevelProgress {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LEVEL_PROGRESS_KEY) || '{}') as LevelProgress;
  } catch {
    return {};
  }
}

export function markLevelProgress(levelId: string, correct: number, total: number) {
  const p = levelProgress();
  p[levelId] = { done: correct >= Math.ceil(total * 0.6), correct, total };
  localStorage.setItem(LEVEL_PROGRESS_KEY, JSON.stringify(p));
  // 同步旧 quiz key 兼容徽章
  try {
    const legacy = JSON.parse(localStorage.getItem('presto_quiz_progress') || '{}') as Record<string, boolean>;
    legacy[levelId] = p[levelId].done;
    localStorage.setItem('presto_quiz_progress', JSON.stringify(legacy));
  } catch { /* ignore */ }
}

export function challengeSummary(levels: ChallengeLevel[] = allChallengeLevels()) {
  const prog = levelProgress();
  let completedLevels = 0;
  let totalQ = 0;
  let correctQ = 0;
  let nextLevel: ChallengeLevel | null = null;
  for (const lv of levels) {
    const p = prog[lv.id];
    totalQ += lv.questions.length;
    correctQ += p?.correct ?? 0;
    if (p?.done) completedLevels++;
    else if (!nextLevel) nextLevel = lv;
  }
  return {
    completedLevels,
    totalLevels: levels.length,
    totalQ,
    correctQ,
    nextLevel,
    progressPct: totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0,
  };
}

export interface PendingBookChallenge {
  bookId: string;
  bookName: string;
  levelId: string;
}

export function getPendingBookChallenge(): PendingBookChallenge | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_BOOK_KEY);
    return raw ? (JSON.parse(raw) as PendingBookChallenge) : null;
  } catch {
    return null;
  }
}

export function setPendingBookChallenge(bookId: string, bookName: string) {
  const pushed = new Set<string>(JSON.parse(localStorage.getItem(PUSHED_BOOKS_KEY) || '[]'));
  if (pushed.has(bookId.toUpperCase())) return;
  pushed.add(bookId.toUpperCase());
  localStorage.setItem(PUSHED_BOOKS_KEY, JSON.stringify([...pushed]));
  const lv = bookChallengeLevel(bookId, bookName);
  localStorage.setItem(
    PENDING_BOOK_KEY,
    JSON.stringify({ bookId: bookId.toUpperCase(), bookName, levelId: lv.id } satisfies PendingBookChallenge),
  );
}

export function clearPendingBookChallenge() {
  localStorage.removeItem(PENDING_BOOK_KEY);
}

export function levelsIncludingPending(): ChallengeLevel[] {
  const pending = getPendingBookChallenge();
  const extra = pending ? [bookChallengeLevel(pending.bookId, pending.bookName)] : [];
  return allChallengeLevels(extra);
}
