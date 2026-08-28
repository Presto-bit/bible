/** 阅读段落边界：CNV 生成表 + 离线兜底算法（对齐 scripts/build_paragraphs.py）。 */

export interface VerseLine {
  verse: number;
  text: string;
}

export interface VerseParagraph {
  startVerse: number;
  endVerse: number;
  verses: VerseLine[];
}

export type ParagraphRange = [number, number];

const POETRY_BOOKS = new Set([
  'PSA', 'PRO', 'ECC', 'SNG', 'LAM', 'AMO', 'MIC', 'HAB', 'ZEP', 'NAH',
  'HAG', 'ZEC', 'MAL', 'JOB',
]);

const MIN_VERSES = 2;
const MAX_VERSES = 6;
const MAX_CHARS = 320;
const MIN_WEAK_VERSES = 3;
const MIN_WEAK_CHARS = 120;

export function isPoetryBook(bookId: string): boolean {
  return POETRY_BOOKS.has(bookId.toUpperCase());
}

function endsSentence(text: string): boolean {
  return /[。！？；….!?;:]["'」』)]*$/.test(text.trim());
}

function charCount(buf: VerseLine[]): number {
  return buf.reduce((n, v) => n + v.text.length, 0);
}

function mergeSingletonRanges(
  ranges: ParagraphRange[],
  verseMap: Map<number, VerseLine>,
): ParagraphRange[] {
  if (ranges.length <= 1) return ranges;
  const out: ParagraphRange[] = [];
  for (const [start, end] of ranges) {
    if (end - start + 1 > 1 || !out.length) {
      out.push([start, end]);
      continue;
    }
    const prev = out[out.length - 1]!;
    const combined = prev[1] - prev[0] + 2;
    let chars = 0;
    for (let n = prev[0]; n <= end; n++) {
      chars += verseMap.get(n)?.text.length ?? 0;
    }
    if (combined <= MAX_VERSES && chars <= MAX_CHARS) {
      prev[1] = end;
    } else {
      out.push([start, end]);
    }
  }
  return out;
}

function segmentStarts(sectionStarts: number[], first: number, last: number): number[] {
  const starts = [...new Set(sectionStarts.filter((s) => s >= first && s <= last))].sort(
    (a, b) => a - b,
  );
  if (!starts.length || starts[0] !== first) {
    return [first, ...starts.filter((s) => s !== first)];
  }
  return starts;
}

function groupSegment(verses: VerseLine[]): ParagraphRange[] {
  if (!verses.length) return [];
  const ranges: ParagraphRange[] = [];
  let buf: VerseLine[] = [];

  const flush = () => {
    if (!buf.length) return;
    ranges.push([buf[0]!.verse, buf[buf.length - 1]!.verse]);
    buf = [];
  };

  for (const v of verses) {
    if (buf.length) {
      if (buf.length >= MAX_VERSES || charCount(buf) >= MAX_CHARS) {
        flush();
      } else if (
        buf.length >= MIN_WEAK_VERSES
        && charCount(buf) >= MIN_WEAK_CHARS
        && endsSentence(buf[buf.length - 1]!.text)
      ) {
        flush();
      }
    }
    buf.push(v);
  }
  flush();

  const verseMap = new Map(verses.map((v) => [v.verse, v]));
  return mergeSingletonRanges(ranges, verseMap);
}

/** 离线兜底：sections 小标题 + 合并规则（无 paragraphs.json 时）。 */
export function computeParagraphRanges(
  bookId: string,
  verses: VerseLine[],
  sectionStarts: number[] = [],
): ParagraphRange[] {
  if (!verses.length) return [];
  if (isPoetryBook(bookId)) {
    return verses.map((v) => [v.verse, v.verse] as ParagraphRange);
  }

  const sorted = [...verses].sort((a, b) => a.verse - b.verse);
  const first = sorted[0]!.verse;
  const last = sorted[sorted.length - 1]!.verse;
  const starts = segmentStarts(sectionStarts, first, last);
  const out: ParagraphRange[] = [];

  for (let i = 0; i < starts.length; i++) {
    const segStart = starts[i]!;
    const segEnd = i + 1 < starts.length ? starts[i + 1]! - 1 : last;
    const segVerses = sorted.filter((v) => v.verse >= segStart && v.verse <= segEnd);
    out.push(...groupSegment(segVerses));
  }
  return out;
}

export function paragraphsFromRanges(
  verses: VerseLine[],
  ranges: ParagraphRange[],
): VerseParagraph[] {
  if (!verses.length || !ranges.length) return [];
  const map = new Map(verses.map((v) => [v.verse, v]));
  const out: VerseParagraph[] = [];
  for (const [start, end] of ranges) {
    const chunk: VerseLine[] = [];
    for (let n = start; n <= end; n++) {
      const v = map.get(n);
      if (v) chunk.push(v);
    }
    if (chunk.length) {
      out.push({ startVerse: chunk[0]!.verse, endVerse: chunk[chunk.length - 1]!.verse, verses: chunk });
    }
  }
  return out;
}

/** 将一章经节分组为连续段落。优先使用出版段落表，否则走兜底算法。 */
export function groupVersesIntoParagraphs(
  bookId: string,
  verses: VerseLine[],
  sectionStarts: number[] = [],
  paragraphRanges?: ParagraphRange[] | null,
): VerseParagraph[] {
  if (!verses.length) return [];
  const ranges =
    paragraphRanges && paragraphRanges.length
      ? paragraphRanges
      : computeParagraphRanges(bookId, verses, sectionStarts);
  return paragraphsFromRanges(verses, ranges);
}