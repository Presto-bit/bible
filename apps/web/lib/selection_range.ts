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
