/** 列表/宣告体排版 catalog（discourse_line_ranges.json，家谱分号换行等）。 */

export type DiscourseMode = 'verse_per_line' | 'semicolon_break';

export type DiscourseEntry = {
  ref: string;
  ranges: [number, number][];
  mode: DiscourseMode;
  kind?: string;
};

type DiscoursePayload = {
  schema?: string;
  entries?: DiscourseEntry[];
};

let cache: DiscourseEntry[] | null = null;
let loadPromise: Promise<DiscourseEntry[]> | null = null;

function chapterKey(bookId: string, chapter: number): string {
  return `${bookId.toUpperCase()}.${chapter}`;
}

function inRange(verse: number, start: number, end: number): boolean {
  return verse >= start && verse <= end;
}

async function loadDiscourseCatalog(): Promise<DiscourseEntry[]> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { api } = await import('@/lib/api');
      const data = (await api.discourseRanges()) as DiscoursePayload;
      cache = data.entries ?? [];
      return cache;
    } catch {
      cache = [];
      return cache;
    }
  })();
  return loadPromise;
}

/** 预加载 catalog（阅读器 mount 时与 paragraphs 一并调用）。 */
export function preloadDiscourseRanges(): void {
  void loadDiscourseCatalog();
}

export function invalidateDiscourseCache(): void {
  cache = null;
  loadPromise = null;
}

export async function discourseEntriesForChapterAsync(
  bookId: string,
  chapter: number,
): Promise<DiscourseEntry[]> {
  const all = await loadDiscourseCatalog();
  const key = chapterKey(bookId, chapter);
  return all.filter((e) => e.ref.toUpperCase() === key);
}

export function discourseEntriesForChapter(
  bookId: string,
  chapter: number,
): DiscourseEntry[] | null {
  if (!cache) return null;
  const key = chapterKey(bookId, chapter);
  const entries = cache.filter((e) => e.ref.toUpperCase() === key);
  return entries.length ? entries : null;
}

/** 该节是否启用分号清单换行（家谱等）。 */
export function isSemicolonBreakVerse(
  bookId: string,
  chapter: number,
  verse: number,
  entries?: DiscourseEntry[] | null,
): boolean {
  const list =
    entries ??
    discourseEntriesForChapter(bookId, chapter) ??
    [];
  return list.some(
    (e) =>
      e.mode === 'semicolon_break' &&
      e.ranges.some(([s, end]) => inRange(verse, s, end)),
  );
}

/** 该节是否标记为列表/宣告体（段内 block 兜底）。 */
export function isDiscourseVerse(
  bookId: string,
  chapter: number,
  verse: number,
  entries?: DiscourseEntry[] | null,
): boolean {
  const list =
    entries ??
    discourseEntriesForChapter(bookId, chapter) ??
    [];
  return list.some(
    (e) =>
      e.mode === 'verse_per_line' &&
      e.ranges.some(([s, end]) => inRange(verse, s, end)),
  );
}

/** 分号清单：将经文按 `；` 拆为多行（保留分号在行末）。 */
export function splitSemicolonListLines(text: string): string[] {
  if (!text.includes('；')) return [text];
  const parts = text.split('；');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i] ?? '';
    if (!chunk && i === parts.length - 1) break;
    out.push(i < parts.length - 1 ? `${chunk}；` : chunk);
  }
  return out.filter((line) => line.length > 0);
}

/** 复制/选区：家谱等分号段内保留换行。 */
export function formatVerseTextForReader(
  bookId: string,
  chapter: number,
  verse: number,
  text: string,
  entries?: DiscourseEntry[] | null,
): string {
  if (!isSemicolonBreakVerse(bookId, chapter, verse, entries)) return text;
  const lines = splitSemicolonListLines(text);
  return lines.length > 1 ? lines.join('\n') : text;
}

export function chapterHasDiscourseVersePerLine(
  bookId: string,
  chapter: number,
  entries?: DiscourseEntry[] | null,
): boolean {
  const list = entries ?? discourseEntriesForChapter(bookId, chapter) ?? [];
  return list.some((e) => e.mode === 'verse_per_line');
}
