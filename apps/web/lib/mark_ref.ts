/** 划线锚点 ref 解析与阅读器跳转（支持节内词组 @offset）。 */

export type ParsedMarkRef = {
  bookId: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  spanStart?: number;
  spanEnd?: number;
  raw: string;
};

/** 解析 `JHN.3.16`、`JHN.3.3-5`、`JHN.3.16@12-45`。 */
export function parseMarkRef(ref: string): ParsedMarkRef | null {
  const raw = ref.trim();
  if (!raw) return null;
  const [base, spanPart] = raw.split('@');
  const parts = base.split('.');
  if (parts.length < 2) return null;
  const bookId = parts[0];
  const chapter = Number(parts[1]);
  if (!bookId || Number.isNaN(chapter)) return null;

  let verseStart: number | undefined;
  let verseEnd: number | undefined;
  if (parts.length >= 3 && parts[2]) {
    const tail = parts[2];
    if (tail.includes('-')) {
      const [a, b] = tail.split('-').map(Number);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        verseStart = a;
        verseEnd = b;
      }
    } else {
      const v = Number(tail);
      if (!Number.isNaN(v)) verseStart = v;
    }
  }

  let spanStart: number | undefined;
  let spanEnd: number | undefined;
  if (spanPart) {
    const [s, e] = spanPart.split('-').map(Number);
    if (!Number.isNaN(s) && !Number.isNaN(e)) {
      spanStart = s;
      spanEnd = e;
    }
  }

  return {
    bookId,
    chapter,
    verseStart,
    verseEnd,
    spanStart,
    spanEnd,
    raw,
  };
}

/** 去掉 @span 的基础 ref（用于云同步）。 */
export function syncRef(ref: string): string {
  return ref.split('@')[0] ?? ref;
}

export function selectionRef(
  bookId: string,
  chapter: number,
  verses: number[],
  span?: { start: number; end: number } | null,
): string {
  const sel = [...verses].sort((a, b) => a - b);
  if (!sel.length) return `${bookId}.${chapter}`;
  let base: string;
  if (sel[0] === sel[sel.length - 1]) base = `${bookId}.${chapter}.${sel[0]}`;
  else base = `${bookId}.${chapter}.${sel[0]}-${sel[sel.length - 1]}`;
  if (span && sel.length === 1 && span.end > span.start) {
    return `${base}@${span.start}-${span.end}`;
  }
  return base;
}

/** 阅读器 URL（含闪烁定位参数）。 */
export function readerMarkHref(ref: string, flash = true): string {
  const p = parseMarkRef(ref);
  if (!p) return '/reader';
  const params = new URLSearchParams();
  params.set('book', p.bookId);
  params.set('chapter', String(p.chapter));
  if (p.verseStart != null) params.set('verse', String(p.verseStart));
  if (flash) params.set('flash', ref);
  return `/reader?${params.toString()}`;
}

export function formatMarkRefLabel(
  ref: string,
  bookNames: Record<string, string>,
): string {
  const p = parseMarkRef(ref);
  if (!p) return ref;
  const name = bookNames[p.bookId] || p.bookId;
  if (p.verseStart == null) return `${name} ${p.chapter}`;
  const vs =
    p.verseEnd != null && p.verseEnd !== p.verseStart
      ? `${p.verseStart}–${p.verseEnd}`
      : `${p.verseStart}`;
  const span =
    p.spanStart != null && p.spanEnd != null
      ? ` (${p.spanStart}–${p.spanEnd})`
      : '';
  return `${name} ${p.chapter}:${vs}${span}`;
}
