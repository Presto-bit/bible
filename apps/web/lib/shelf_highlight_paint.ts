/** 书架正文划线绘制：优先 CSS Highlight API，不改动 DOM 分页。 */

import type { HighlightColor, HighlightMark } from './reader_highlights';
import { parseShelfMarkRef } from './shelf_mark_ref';
import { rangeFromArticleOffsets } from './shelf_selection';

const MARK_PREFIX = 'shelf-mark-';
const THOUGHT_HINT = 'shelf-thought-hint';
const PUBLIC_NOTE_HINT = 'shelf-public-note-hint';
const SEL_ACTIVE = 'shelf-sel-active';

export function supportsShelfCssHighlight(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS;
}

function clearNamedHighlight(name: string) {
  if (!supportsShelfCssHighlight()) return;
  try {
    CSS.highlights.delete(name);
  } catch {
    /* ignore */
  }
}

export function clearShelfPaintedHighlights() {
  if (!supportsShelfCssHighlight()) return;
  for (const color of ['yellow', 'green', 'blue', 'pink', 'orange']) {
    clearNamedHighlight(`${MARK_PREFIX}${color}`);
  }
  clearNamedHighlight(THOUGHT_HINT);
  clearNamedHighlight(PUBLIC_NOTE_HINT);
}

type PaintMark = {
  start: number;
  end: number;
  color: HighlightColor;
};

export function paintShelfHighlights(
  article: HTMLElement | null,
  marks: PaintMark[],
  thoughtSpans: Array<{ start: number; end: number }> = [],
  publicNoteSpans: Array<{ start: number; end: number }> = [],
): boolean {
  clearShelfPaintedHighlights();
  if (!article || !supportsShelfCssHighlight()) return false;

  const byColor = new Map<HighlightColor, Range[]>();
  for (const m of marks) {
    const range = rangeFromArticleOffsets(article, m.start, m.end);
    if (!range) continue;
    const list = byColor.get(m.color) ?? [];
    list.push(range);
    byColor.set(m.color, list);
  }

  let painted = false;
  for (const [color, ranges] of byColor) {
    if (!ranges.length) continue;
    try {
      CSS.highlights.set(`${MARK_PREFIX}${color}`, new Highlight(...ranges));
      painted = true;
    } catch {
      /* ignore */
    }
  }

  if (thoughtSpans.length) {
    const thoughtRanges: Range[] = [];
    for (const span of thoughtSpans) {
      const range = rangeFromArticleOffsets(article, span.start, span.end);
      if (range) thoughtRanges.push(range);
    }
    if (thoughtRanges.length) {
      try {
        CSS.highlights.set(THOUGHT_HINT, new Highlight(...thoughtRanges));
        painted = true;
      } catch {
        /* ignore */
      }
    }
  }

  if (publicNoteSpans.length) {
    const publicRanges: Range[] = [];
    for (const span of publicNoteSpans) {
      const range = rangeFromArticleOffsets(article, span.start, span.end);
      if (range) publicRanges.push(range);
    }
    if (publicRanges.length) {
      try {
        CSS.highlights.set(PUBLIC_NOTE_HINT, new Highlight(...publicRanges));
        painted = true;
      } catch {
        /* ignore */
      }
    }
  }

  return painted;
}

export function paintShelfActiveSelection(
  article: HTMLElement | null,
  start: number,
  end: number,
): boolean {
  clearNamedHighlight(SEL_ACTIVE);
  if (!article || !supportsShelfCssHighlight()) return false;
  const range = rangeFromArticleOffsets(article, start, end);
  if (!range) return false;
  try {
    CSS.highlights.set(SEL_ACTIVE, new Highlight(range));
    return true;
  } catch {
    return false;
  }
}

export function clearShelfActiveSelection() {
  clearNamedHighlight(SEL_ACTIVE);
}

export function clearShelfPinnedSelectionDom(article: HTMLElement | null) {
  if (!article) return;
  article.querySelectorAll('mark.shelf-sel-pinned').forEach((node) => {
    const mark = node as HTMLElement;
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
}

export function pinShelfActiveSelectionDom(
  article: HTMLElement | null,
  start: number,
  end: number,
): boolean {
  if (!article) return false;
  clearShelfPinnedSelectionDom(article);
  const range = rangeFromArticleOffsets(article, start, end);
  if (!range) return false;
  try {
    const mark = document.createElement('mark');
    mark.className = 'shelf-sel-pinned';
    const contents = range.extractContents();
    mark.appendChild(contents);
    range.insertNode(mark);
    return true;
  } catch {
    return false;
  }
}

export function shelfMarksForPage(
  bookId: string,
  sectionId: string,
  pageIndex: number,
  map: Record<string, HighlightMark>,
): PaintMark[] {
  const out: PaintMark[] = [];
  for (const [ref, mark] of Object.entries(map)) {
    const p = parseShelfMarkRef(ref);
    if (!p || p.bookId !== bookId || p.sectionId !== sectionId || p.pageIndex !== pageIndex) {
      continue;
    }
    if (p.spanStart == null || p.spanEnd == null) continue;
    out.push({ start: p.spanStart, end: p.spanEnd, color: mark.color });
  }
  return out;
}

export function findShelfHighlightRef(
  bookId: string,
  sectionId: string,
  pageIndex: number,
  span: { start: number; end: number },
  map: Record<string, HighlightMark>,
): string | null {
  for (const ref of Object.keys(map)) {
    if (!map[ref]) continue;
    const p = parseShelfMarkRef(ref);
    if (!p || p.bookId !== bookId || p.sectionId !== sectionId || p.pageIndex !== pageIndex) {
      continue;
    }
    if (p.spanStart === span.start && p.spanEnd === span.end) return ref;
  }
  return null;
}

export function pickShelfHighlight(
  ref: string,
  color: HighlightColor,
  map: Record<string, HighlightMark>,
  setHighlight: (ref: string, color: HighlightColor) => void,
  removeHighlight: (ref: string) => boolean,
): boolean {
  const existing = map[ref];
  if (existing?.color === color) {
    removeHighlight(ref);
    return false;
  }
  setHighlight(ref, color);
  return true;
}
