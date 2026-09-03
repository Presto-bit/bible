/** 书架标注：聚合想法/划线查询（复用读经存储）。 */

import { getHighlightMap, type HighlightMark } from './reader_highlights';
import { listAllThoughts, myThoughtsForRef, type ThoughtRow } from './reader_thoughts';
import { parseShelfMarkRef } from './shelf_mark_ref';

export function shelfThoughtsForPage(
  bookId: string,
  sectionId: string,
  pageIndex: number,
): ThoughtRow[] {
  return listAllThoughts().filter((t) => {
    const p = parseShelfMarkRef(t.ref);
    return (
      p != null
      && p.bookId === bookId
      && p.sectionId === sectionId
      && p.pageIndex === pageIndex
    );
  });
}

export function shelfThoughtSpansForPage(
  bookId: string,
  sectionId: string,
  pageIndex: number,
): Array<{ start: number; end: number }> {
  const seen = new Set<string>();
  const spans: Array<{ start: number; end: number }> = [];
  for (const t of shelfThoughtsForPage(bookId, sectionId, pageIndex)) {
    const p = parseShelfMarkRef(t.ref);
    if (p?.spanStart == null || p.spanEnd == null) continue;
    const key = `${p.spanStart}-${p.spanEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    spans.push({ start: p.spanStart, end: p.spanEnd });
  }
  return spans;
}

export function shelfHighlightsForPage(
  bookId: string,
  sectionId: string,
  pageIndex: number,
  map: Record<string, HighlightMark> = getHighlightMap(),
): Array<{ ref: string; mark: HighlightMark; start: number; end: number }> {
  const out: Array<{ ref: string; mark: HighlightMark; start: number; end: number }> = [];
  for (const [ref, mark] of Object.entries(map)) {
    const p = parseShelfMarkRef(ref);
    if (!p || p.bookId !== bookId || p.sectionId !== sectionId || p.pageIndex !== pageIndex) {
      continue;
    }
    if (p.spanStart == null || p.spanEnd == null) continue;
    out.push({ ref, mark, start: p.spanStart, end: p.spanEnd });
  }
  return out;
}

export function findShelfThoughtAtOffset(
  bookId: string,
  sectionId: string,
  pageIndex: number,
  offset: number,
): ThoughtRow | null {
  for (const t of shelfThoughtsForPage(bookId, sectionId, pageIndex)) {
    const p = parseShelfMarkRef(t.ref);
    if (!p || p.spanStart == null || p.spanEnd == null) continue;
    if (offset >= p.spanStart && offset < p.spanEnd) return t;
  }
  return null;
}
