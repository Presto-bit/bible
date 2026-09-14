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

type SectionsPayload = {
  chapters?: Record<string, { verse: number; title: string }[]>;
};

/** 缓存键：zh | en（KJV 等英译）| niv（NIV 原生英文） */
type SectionsCacheKey = 'zh' | 'en' | 'niv';

const cacheByKey = new Map<SectionsCacheKey, Record<string, SectionMark[]>>();
const loadPromises = new Map<
  SectionsCacheKey,
  Promise<Record<string, SectionMark[]>>
>();

function chapterKey(bookId: string, chapter: number): string {
  return `${bookId.toUpperCase()}.${chapter}`;
}

function sectionsCacheKey(versionId?: string | null): SectionsCacheKey {
  const id = (versionId || '').trim().toLowerCase();
  if (id === 'niv') return 'niv';
  return sectionTitlesLang(versionId);
}

async function localizeIndex(
  idx: Record<string, SectionMark[]>,
  lang: 'zh' | 'en',
): Promise<Record<string, SectionMark[]>> {
  if (lang === 'zh') return idx;
  const out: Record<string, SectionMark[]> = {};
  for (const [key, marks] of Object.entries(idx)) {
    out[key] = await localizeSectionMarksAsync(marks, lang);
  }
  return out;
}

async function loadSectionsIndex(
  cacheKey: SectionsCacheKey,
): Promise<Record<string, SectionMark[]>> {
  const cached = cacheByKey.get(cacheKey);
  if (cached) return cached;
  let pending = loadPromises.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      try {
        const { api } = await import('@/lib/api');
        if (cacheKey === 'niv') {
          const data = (await api.sectionTitles(
            undefined,
            undefined,
            'en',
            'niv',
          )) as SectionsPayload;
          const chapters = data.chapters ?? {};
          const idx: Record<string, SectionMark[]> = {};
          for (const [key, marks] of Object.entries(chapters)) {
            idx[key] = marks.map((m) => ({ verse: m.verse, title: m.title }));
          }
          // NIV：只用原生英文标题，不合并中文 SECTION_OUTLINES
          cacheByKey.set(cacheKey, idx);
          return idx;
        }
        const lang = cacheKey;
        const data = (await api.sectionTitles(
          undefined,
          undefined,
          lang,
        )) as SectionsPayload;
        const chapters = data.chapters ?? {};
        const idx: Record<string, SectionMark[]> = {};
        for (const [key, marks] of Object.entries(chapters)) {
          idx[key] = marks.map((m) => ({ verse: m.verse, title: m.title }));
        }
        const merged = { ...SECTION_OUTLINES, ...idx };
        const result = await localizeIndex(merged, lang);
        cacheByKey.set(cacheKey, result);
        return result;
      } catch {
        if (cacheKey === 'niv') {
          const empty = {};
          cacheByKey.set(cacheKey, empty);
          return empty;
        }
        const fallback = { ...SECTION_OUTLINES };
        const result = await localizeIndex(fallback, cacheKey);
        cacheByKey.set(cacheKey, result);
        return result;
      }
    })();
    loadPromises.set(cacheKey, pending);
  }
  return pending;
}

/** 预加载段落标题索引（阅读器 mount 时调用） */
export function preloadSectionTitles(versionId?: string | null): void {
  const key = sectionsCacheKey(versionId);
  void loadSectionsIndex(key);
  if (key === 'en') preloadSectionTitleTranslations();
}

/** 同步读取：需先 preload；无缓存时回退手工大纲（NIV 不回落中文） */
export function outlineFor(
  bookId: string,
  chapter: number,
  versionId?: string | null,
): SectionMark[] {
  const key = sectionsCacheKey(versionId);
  const ck = chapterKey(bookId, chapter);
  const cached = cacheByKey.get(key)?.[ck];
  if (cached?.length) return cached;
  if (key === 'niv') return [];
  const marks = SECTION_OUTLINES[ck] ?? [];
  return localizeSectionMarks(
    marks,
    key,
    getSectionTitleEnMapSync() ?? undefined,
  );
}

/** 异步读取（确保已加载对应译本标题） */
export async function outlineForAsync(
  bookId: string,
  chapter: number,
  versionId?: string | null,
): Promise<SectionMark[]> {
  const key = sectionsCacheKey(versionId);
  const idx = await loadSectionsIndex(key);
  return idx[chapterKey(bookId, chapter)] ?? [];
}

export function invalidateSectionCache() {
  cacheByKey.clear();
  loadPromises.clear();
}
