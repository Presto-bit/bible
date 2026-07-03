import type { SectionMark } from './outlines';
import { SECTION_OUTLINES } from './outlines';

export type { SectionMark };

type SectionsPayload = {
  chapters?: Record<string, { verse: number; title: string }[]>;
};

let cache: Record<string, SectionMark[]> | null = null;
let loadPromise: Promise<Record<string, SectionMark[]>> | null = null;

function chapterKey(bookId: string, chapter: number): string {
  return `${bookId.toUpperCase()}.${chapter}`;
}

async function loadSectionsIndex(): Promise<Record<string, SectionMark[]>> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { api } = await import('@/lib/api');
      const data = (await api.sectionTitles()) as SectionsPayload;
      const chapters = data.chapters ?? {};
      const idx: Record<string, SectionMark[]> = {};
      for (const [key, marks] of Object.entries(chapters)) {
        idx[key] = marks.map((m) => ({ verse: m.verse, title: m.title }));
      }
      cache = { ...SECTION_OUTLINES, ...idx };
      return cache;
    } catch {
      cache = { ...SECTION_OUTLINES };
      return cache;
    }
  })();
  return loadPromise;
}

/** 预加载段落标题索引（阅读器 mount 时调用） */
export function preloadSectionTitles(): void {
  void loadSectionsIndex();
}

/** 同步读取：需先 preload；无缓存时回退手工大纲 */
export function outlineFor(bookId: string, chapter: number): SectionMark[] {
  const key = chapterKey(bookId, chapter);
  if (cache?.[key]?.length) return cache[key];
  return SECTION_OUTLINES[key] ?? [];
}

/** 异步读取（确保已加载 CNV 源文件标题） */
export async function outlineForAsync(bookId: string, chapter: number): Promise<SectionMark[]> {
  const idx = await loadSectionsIndex();
  return idx[chapterKey(bookId, chapter)] ?? [];
}

export function invalidateSectionCache() {
  cache = null;
  loadPromise = null;
}
