import type { SectionMark } from './outlines';
import { SECTION_OUTLINES } from './outlines';
import {
  getSectionTitleEnMapSync,
  localizeSectionMarks,
  localizeSectionMarksAsync,
  preloadSectionTitleTranslations,
  sectionTitlesLang,
} from './section_title_i18n';

export type { SectionMark };
export { sectionTitlesLang };

type SectionTitlesLang = 'zh' | 'en';

type SectionsPayload = {
  chapters?: Record<string, { verse: number; title: string }[]>;
};

const cacheByLang = new Map<SectionTitlesLang, Record<string, SectionMark[]>>();
const loadPromises = new Map<SectionTitlesLang, Promise<Record<string, SectionMark[]>>>();

function chapterKey(bookId: string, chapter: number): string {
  return `${bookId.toUpperCase()}.${chapter}`;
}

async function localizeIndex(
  idx: Record<string, SectionMark[]>,
  lang: SectionTitlesLang,
): Promise<Record<string, SectionMark[]>> {
  if (lang === 'zh') return idx;
  const out: Record<string, SectionMark[]> = {};
  for (const [key, marks] of Object.entries(idx)) {
    out[key] = await localizeSectionMarksAsync(marks, lang);
  }
  return out;
}

async function loadSectionsIndex(
  lang: SectionTitlesLang = 'zh',
): Promise<Record<string, SectionMark[]>> {
  const cached = cacheByLang.get(lang);
  if (cached) return cached;
  let pending = loadPromises.get(lang);
  if (!pending) {
    pending = (async () => {
      try {
        const { api } = await import('@/lib/api');
        const data = (await api.sectionTitles(undefined, undefined, lang)) as SectionsPayload;
        const chapters = data.chapters ?? {};
        const idx: Record<string, SectionMark[]> = {};
        for (const [key, marks] of Object.entries(chapters)) {
          idx[key] = marks.map((m) => ({ verse: m.verse, title: m.title }));
        }
        const merged = { ...SECTION_OUTLINES, ...idx };
        const result = await localizeIndex(merged, lang);
        cacheByLang.set(lang, result);
        return result;
      } catch {
        const fallback = { ...SECTION_OUTLINES };
        const result = await localizeIndex(fallback, lang);
        cacheByLang.set(lang, result);
        return result;
      }
    })();
    loadPromises.set(lang, pending);
  }
  return pending;
}

/** 预加载段落标题索引（阅读器 mount 时调用） */
export function preloadSectionTitles(versionId?: string | null): void {
  const lang = sectionTitlesLang(versionId);
  void loadSectionsIndex(lang);
  if (lang === 'en') preloadSectionTitleTranslations();
}

/** 同步读取：需先 preload；无缓存时回退手工大纲 */
export function outlineFor(
  bookId: string,
  chapter: number,
  versionId?: string | null,
): SectionMark[] {
  const lang = sectionTitlesLang(versionId);
  const key = chapterKey(bookId, chapter);
  const cached = cacheByLang.get(lang)?.[key];
  if (cached?.length) return cached;
  const marks = SECTION_OUTLINES[key] ?? [];
  return localizeSectionMarks(marks, lang, getSectionTitleEnMapSync() ?? undefined);
}

/** 异步读取（确保已加载 CNV 源文件标题） */
export async function outlineForAsync(
  bookId: string,
  chapter: number,
  versionId?: string | null,
): Promise<SectionMark[]> {
  const lang = sectionTitlesLang(versionId);
  const idx = await loadSectionsIndex(lang);
  return idx[chapterKey(bookId, chapter)] ?? [];
}

export function invalidateSectionCache() {
  cacheByLang.clear();
  loadPromises.clear();
}
