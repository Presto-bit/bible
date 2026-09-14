/** 段落小标题 zh→en（KJV UI；缺译名回退中文原文）。 */
import type { SectionMark } from './outlines';
import { isEnglishBibleVersion } from './bible_version';

let enMap: Record<string, string> | null = null;
let enMapPromise: Promise<Record<string, string>> | null = null;

export function sectionTitlesLang(versionId: string | null | undefined): 'zh' | 'en' {
  return isEnglishBibleVersion(versionId) ? 'en' : 'zh';
}

async function loadEnMap(): Promise<Record<string, string>> {
  if (enMap) return enMap;
  if (!enMapPromise) {
    enMapPromise = (async () => {
      try {
        const { api } = await import('@/lib/api');
        const data = (await api.sectionTitleTranslations()) as {
          titles?: Record<string, string>;
        };
        enMap = data.titles ?? {};
      } catch {
        enMap = {};
      }
      return enMap;
    })();
  }
  return enMapPromise;
}

export function getSectionTitleEnMapSync(): Record<string, string> | null {
  return enMap;
}

export function preloadSectionTitleTranslations(): void {
  void loadEnMap();
}

export function localizeSectionTitle(
  title: string,
  lang: 'zh' | 'en',
  map?: Record<string, string>,
): string {
  const zh = title.trim();
  if (!zh || lang === 'zh') return zh;
  return map?.[zh] ?? zh;
}

export function localizeSectionMarks(
  marks: SectionMark[],
  lang: 'zh' | 'en',
  map?: Record<string, string>,
): SectionMark[] {
  if (lang === 'zh') return marks;
  return marks.map((m) => ({
    verse: m.verse,
    title: localizeSectionTitle(m.title, lang, map),
  }));
}

export async function localizeSectionMarksAsync(
  marks: SectionMark[],
  lang: 'zh' | 'en',
): Promise<SectionMark[]> {
  if (lang === 'zh') return marks;
  const map = await loadEnMap();
  return localizeSectionMarks(marks, lang, map);
}
