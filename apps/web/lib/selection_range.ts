/** 触控词选范围（支持跨节） */

export type WordAnchor = { verse: number; start: number; end: number };

export type WordRange = { anchor: WordAnchor; focus: WordAnchor };

export function normalizeWordRange(range: WordRange): {
  verses: number[];
  anchor: WordAnchor;
  focus: WordAnchor;
} {
  const a = range.anchor;
  const f = range.focus;
  if (a.verse < f.verse || (a.verse === f.verse && a.start <= f.start)) {
    const verses = Array.from({ length: f.verse - a.verse + 1 }, (_, i) => a.verse + i);
    return { verses, anchor: a, focus: f };
  }
  const verses = Array.from({ length: a.verse - f.verse + 1 }, (_, i) => f.verse + i);
  return { verses, anchor: f, focus: a };
}

export function wordRangeToSpan(
  range: WordRange,
): { verses: number[]; span: { start: number; end: number } | null } {
  const { verses, anchor, focus } = normalizeWordRange(range);
  if (verses.length === 1) {
    const lo = Math.min(anchor.start, focus.start);
    const hi = Math.max(anchor.end, focus.end);
    return { verses, span: hi > lo ? { start: lo, end: hi } : null };
  }
  return { verses, span: null };
}

export function textFromWordRange(
  range: WordRange,
  verseText: (verse: number) => string,
): string {
  const { verses, anchor, focus } = normalizeWordRange(range);
  const loV = anchor.verse;
  const hiV = focus.verse;
  let out = '';
  for (const v of verses) {
    const text = verseText(v);
    if (loV === hiV) {
      out += text.slice(Math.min(anchor.start, focus.start), Math.max(anchor.end, focus.end));
    } else if (v === loV) {
      out += text.slice(anchor.start);
    } else if (v === hiV) {
      out += text.slice(0, focus.end);
    } else {
      out += text;
    }
  }
  return out;
}

export function wordRangesEqual(a: WordRange | null, b: WordRange | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.anchor.verse === b.anchor.verse
    && a.anchor.start === b.anchor.start
    && a.anchor.end === b.anchor.end
    && a.focus.verse === b.focus.verse
    && a.focus.start === b.focus.start
    && a.focus.end === b.focus.end
  );
}

/** 选区左右端（用于圆角），中间词块无圆角以视觉连贯。 */
export function wordSelectionEdge(
  verse: number,
  wordStart: number,
  wordEnd: number,
  range: WordRange,
): { left: boolean; right: boolean } {
  if (!wordOverlapsRange(verse, wordStart, wordEnd, range)) {
    return { left: false, right: false };
  }
  const { anchor, focus } = normalizeWordRange(range);
  const loV = anchor.verse;
  const hiV = focus.verse;
  if (loV === hiV) {
    const lo = Math.min(anchor.start, focus.start);
    const hi = Math.max(anchor.end, focus.end);
    return {
      left: wordStart <= lo && wordEnd > lo,
      right: wordStart < hi && wordEnd >= hi,
    };
  }
  if (verse === loV) {
    return { left: wordStart <= anchor.start && wordEnd > anchor.start, right: true };
  }
  if (verse === hiV) {
    return { left: true, right: wordStart < focus.end && wordEnd >= focus.end };
  }
  return { left: true, right: true };
}

export function wordOverlapsRange(
  verse: number,
  wordStart: number,
  wordEnd: number,
  range: WordRange,
): boolean {
  const { verses, anchor, focus } = normalizeWordRange(range);
  if (!verses.includes(verse)) return false;
  const loV = anchor.verse;
  const hiV = focus.verse;
  if (loV === hiV) {
    const lo = Math.min(anchor.start, focus.start);
    const hi = Math.max(anchor.end, focus.end);
    return wordStart < hi && wordEnd > lo;
  }
  if (verse === loV) return wordEnd > anchor.start;
  if (verse === hiV) return wordStart < focus.end;
  return true;
}
