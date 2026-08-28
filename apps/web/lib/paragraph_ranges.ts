/** 阅读段落边界索引（CNV paragraphs.json，按卷章加载）。 */

import type { ParagraphRange } from './paragraphs';
import { computeParagraphRanges, type VerseLine } from './paragraphs';

type ParagraphsPayload = {
  chapters?: Record<string, ParagraphRange[]>;
};

let cache: Record<string, ParagraphRange[]> | null = null;
let loadPromise: Promise<Record<string, ParagraphRange[]>> | null = null;

function chapterKey(bookId: string, chapter: number): string {
  return `${bookId.toUpperCase()}.${chapter}`;
}

async function loadParagraphsIndex(): Promise<Record<string, ParagraphRange[]>> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { api } = await import('@/lib/api');
      const data = (await api.paragraphRanges()) as ParagraphsPayload;
      cache = data.chapters ?? {};
      return cache;
    } catch {
      cache = {};
      return cache;
    }
  })();
  return loadPromise;
}

/** 预加载段落表（阅读器 mount 时与 sections 一并调用）。 */
export function preloadParagraphRanges(): void {
  void loadParagraphsIndex();
}

export function invalidateParagraphCache(): void {
  cache = null;
  loadPromise = null;
}

/** 同步读取；需先 preload。无缓存时返回 null，由调用方走 computeParagraphRanges。 */
export function paragraphRangesFor(
  bookId: string,
  chapter: number,
): ParagraphRange[] | null {
  const key = chapterKey(bookId, chapter);
  const ranges = cache?.[key];
  return ranges?.length ? ranges : null;
}

/** 当前章段落范围：索引优先；state 仅在有内容时作过渡，空数组视为缺失。 */
export function paragraphRangesForChapter(
  bookId: string,
  chapter: number,
  stateRanges?: ParagraphRange[] | null,
): ParagraphRange[] | null {
  const indexed = paragraphRangesFor(bookId, chapter);
  if (indexed?.length) return indexed;
  if (stateRanges?.length) return stateRanges;
  return null;
}

export async function paragraphRangesForAsync(
  bookId: string,
  chapter: number,
): Promise<ParagraphRange[] | null> {
  const idx = await loadParagraphsIndex();
  const ranges = idx[chapterKey(bookId, chapter)];
  return ranges?.length ? ranges : null;
}

/** 解析最终段落范围：有表用表，无表走兜底算法。 */
export function resolveParagraphRanges(
  bookId: string,
  verses: VerseLine[],
  sectionStarts: number[],
  cachedRanges: ParagraphRange[] | null | undefined,
): ParagraphRange[] {
  if (cachedRanges?.length) return cachedRanges;
  return computeParagraphRanges(bookId, verses, sectionStarts);
}

/** 供调试/测试：段落表是否已从 API 加载。 */
export function paragraphIndexLoaded(): boolean {
  return cache != null;
}
