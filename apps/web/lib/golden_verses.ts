/** 常读金句：合并阅读行为、划线、收藏、想法等信号自动识别。 */

import { loadFavoriteRefs } from './favorites';
import { parseMarkRef } from './mark_ref';
import { getHighlightMap } from './reader_highlights';
import { listAllThoughts } from './reader_thoughts';
import type { RankItem } from './reading';

const WEIGHT_READ = 1;
const WEIGHT_HIGHLIGHT = 5;
const WEIGHT_FAVORITE = 8;
const WEIGHT_THOUGHT = 3;

/** 将划线/想法 ref 归一到 `BOOK.chapter.verse`。 */
export function normalizeGoldenVerseRef(ref: string): string | null {
  const raw = ref.trim();
  if (!raw) return null;
  const p = parseMarkRef(raw);
  if (p?.verseStart != null) {
    return `${p.bookId}.${p.chapter}.${p.verseStart}`;
  }
  const parts = raw.split('.');
  if (parts.length >= 3) {
    const bookId = parts[0];
    const chapter = Number(parts[1]);
    const verse = Number(parts[2]?.split(/[@-]/)[0]);
    if (bookId && Number.isFinite(chapter) && Number.isFinite(verse) && verse > 0) {
      return `${bookId}.${chapter}.${verse}`;
    }
  }
  return null;
}

function addScore(scores: Record<string, number>, ref: string, weight: number) {
  const key = normalizeGoldenVerseRef(ref);
  if (!key) return;
  scores[key] = (scores[key] || 0) + weight;
}

/** 统计时段内常读金句（含全时段划线/收藏/想法加权）。 */
export function collectGoldenVerseScores(
  startMs: number,
  endMs: number,
  verseEvents: Array<{ ts: number; ref: string }>,
): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const e of verseEvents) {
    if (e.ts >= startMs && e.ts < endMs) {
      addScore(scores, e.ref, WEIGHT_READ);
    }
  }

  for (const ref of Object.keys(getHighlightMap())) {
    addScore(scores, ref, WEIGHT_HIGHLIGHT);
  }

  for (const ref of loadFavoriteRefs()) {
    addScore(scores, ref, WEIGHT_FAVORITE);
  }

  for (const t of listAllThoughts()) {
    addScore(scores, t.ref, WEIGHT_THOUGHT);
  }

  return scores;
}

export function rankGoldenVerses(scores: Record<string, number>, limit = 5): RankItem[] {
  return Object.entries(scores)
    .map(([key, count]) => ({ key, count }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}
