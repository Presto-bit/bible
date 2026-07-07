import { computeAllBadges, type BadgeDef } from './badges';
import { loadBadgeStats, markBadgeToasted, stampBadgeUnlock } from './badge_events';
import { buildReport, bookProgressMap } from './reading';
import { readingStreak } from './gamification';
import { listAllThoughts } from './reader_thoughts';
import { bibleBooks } from './bible_client';
import { highlightColorCount, highlightCount } from './reader_highlights';
import { loadFavoriteRefs } from './favorites';
import { getActivePlan, getCompletedPlanDays } from './plan_progress';
import { api, currentUserId } from './api';

export const BADGE_UNLOCK_EVENT = 'presto-badge-unlock';

export function syncBadgeUnlockTimestamps(badges: BadgeDef[]): BadgeDef[] {
  const stats = loadBadgeStats();
  const now = Date.now();
  return badges.map((b) => {
    if (!b.done) return b;
    const at = stats.unlocked_at[b.id] ?? now;
    if (!stats.unlocked_at[b.id]) stampBadgeUnlock(b.id, at);
    return { ...b, unlockedAt: at };
  });
}

export function notifyNewBadgeUnlocks(badges: BadgeDef[]) {
  if (typeof window === 'undefined') return;
  const stats = loadBadgeStats();
  for (const b of badges) {
    if (!b.done || stats.toasted_ids.includes(b.id)) continue;
    markBadgeToasted(b.id);
    window.dispatchEvent(
      new CustomEvent(BADGE_UNLOCK_EVENT, {
        detail: { id: b.id, label: b.label, icon: b.icon },
      }),
    );
  }
}

/** 我的页：最近解锁的「有趣」成就，最多 4 个 */
export function profilePreviewBadges(badges: BadgeDef[], limit = 4): BadgeDef[] {
  const earned = badges.filter((b) => b.done);
  const interesting = earned.filter((b) => b.interesting);
  const pool = interesting.length >= limit ? interesting : earned;
  return [...pool]
    .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))
    .slice(0, limit);
}

export async function buildBadgeContext() {
  const report = buildReport();
  const thoughts = listAllThoughts();
  const noteCount = thoughts.length;
  const stats = loadBadgeStats();
  let readBooks = 0;
  let ntBooksRead = 0;
  let otBooksRead = 0;
  let totalBooks = 66;
  let friendCount = 0;
  let planDays = 0;
  let bookTotals: Record<string, number> = {};
  const NT = new Set([
    'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
    '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN',
    '3JN', 'JUD', 'REV',
  ]);
  try {
    const books = await bibleBooks();
    totalBooks = books.length || 66;
    const totals: Record<string, number> = {};
    for (const b of books) totals[b.id] = b.chapter_count;
    bookTotals = totals;
    const prog = bookProgressMap(totals);
    for (const [id, p] of Object.entries(prog)) {
      if (p.distinctChapters <= 0 && p.passes < 1) continue;
      readBooks += 1;
      if (NT.has(id)) ntBooksRead += 1;
      else otBooksRead += 1;
    }
  } catch {
    /* ignore */
  }
  if (currentUserId()) {
    try {
      const f = await api.friends();
      friendCount = Array.isArray(f.friends) ? f.friends.length : 0;
    } catch {
      /* ignore */
    }
  }
  const active = getActivePlan();
  if (active) planDays = getCompletedPlanDays(active.planId).length;

  return {
    streak: readingStreak(),
    readBooks,
    ntBooksRead,
    otBooksRead,
    totalBooks,
    noteCount,
    monthDays: report.monthDays,
    totalMinutes: report.totalMinutes,
    totalChapters: report.totalChapters,
    highlightCount: highlightCount(),
    highlightColors: highlightColorCount(),
    bookmarkCount: loadFavoriteRefs().length,
    thoughtCount: listAllThoughts().length,
    maxNoteLen: Math.max(0, ...thoughts.map((t) => t.body.length)),
    planDays,
    friendCount,
    bookTotals,
    stats,
  };
}

export async function computeBadgesWithUnlock(): Promise<BadgeDef[]> {
  const ctx = await buildBadgeContext();
  const raw = computeAllBadges(ctx);
  const synced = syncBadgeUnlockTimestamps(raw);
  notifyNewBadgeUnlocks(synced);
  return synced;
}

export async function runBadgeRecheck() {
  await computeBadgesWithUnlock();
}
