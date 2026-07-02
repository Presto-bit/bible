/** 划线统计：计划、Wrapped、小爱整理。 */

import { getHighlightMap, type HighlightColor } from './reader_highlights';
import { parseMarkRef } from './mark_ref';
import { MARK_COLOR_SEMANTICS } from './mark_semantics';
import { getActivePlan, getPlanDay } from './plan_progress';
import { noteForMarkRef } from './mark_notes';

export type MarkListItem = {
  ref: string;
  color: HighlightColor;
  createdAt: number;
  notePreview?: string;
};

export function listMarksDetailed(): MarkListItem[] {
  const map = getHighlightMap();
  const meta = readMeta();
  return Object.entries(map)
    .map(([ref, mark]) => {
      const note = noteForMarkRef(ref);
      return {
        ref,
        color: mark.color,
        createdAt: meta[ref]?.createdAt ?? 0,
        notePreview: note?.body?.slice(0, 80),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt || a.ref.localeCompare(b.ref));
}

const META_KEY = 'reader_marks_meta_v1';

type MarkMeta = { createdAt: number };

function readMeta(): Record<string, MarkMeta> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}') as Record<string, MarkMeta>;
  } catch {
    return {};
  }
}

export function touchMarkMeta(ref: string) {
  if (typeof window === 'undefined') return;
  const meta = readMeta();
  if (!meta[ref]) meta[ref] = { createdAt: Date.now() };
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function statsByColor(): Record<HighlightColor, number> {
  const out = { yellow: 0, green: 0, blue: 0, pink: 0, orange: 0 } as Record<
    HighlightColor,
    number
  >;
  for (const m of listMarksDetailed()) out[m.color] += 1;
  return out;
}

export function statsByBook(): { bookId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of listMarksDetailed()) {
    const p = parseMarkRef(m.ref);
    if (!p) continue;
    counts.set(p.bookId, (counts.get(p.bookId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([bookId, count]) => ({ bookId, count }))
    .sort((a, b) => b.count - a.count);
}

export function topColorLabel(): string {
  const stats = statsByColor();
  const top = (Object.entries(stats) as [HighlightColor, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (!top || top[1] === 0) return '';
  return MARK_COLOR_SEMANTICS[top[0]].label;
}

export function marksInActivePlan(): MarkListItem[] {
  const plan = getActivePlan();
  if (!plan) return [];
  const day = getPlanDay(plan.planId);
  if (day < 1) return [];
  return listMarksDetailed();
}

export function assistantMarksSummary(limit = 12): string {
  const marks = listMarksDetailed().slice(0, limit);
  if (!marks.length) return '你还没有划线。阅读时长按经文即可标记。';
  const lines = marks.map((m) => {
    const sem = MARK_COLOR_SEMANTICS[m.color].label;
    const note = m.notePreview ? ` — ${m.notePreview}` : '';
    return `• [${sem}] ${m.ref}${note}`;
  });
  return `最近 ${marks.length} 条划线：\n${lines.join('\n')}`;
}
