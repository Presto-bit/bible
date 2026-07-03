// 阅读器体验设置：主题（清晨/夜深）、节号模式、对照模式。

export type ReaderTheme = 'morning' | 'sepia' | 'night';
export type VerseNumberMode = 'inline' | 'margin' | 'hidden';
export type ReadingLayout = 'single' | 'parallel';

const THEME_KEY = 'reader_theme';
const VERSE_NO_KEY = 'reader_verse_no';
const LAYOUT_KEY = 'reader_layout';
const PARALLEL_VER_KEY = 'reader_parallel_version';
const MAIN_VER_KEY = 'reader_main_version';

export const READER_THEMES: { id: ReaderTheme; label: string; desc: string }[] = [
  { id: 'morning', label: '白', desc: '清爽留白 · 大行距' },
  { id: 'sepia', label: '黄', desc: '护眼纸黄' },
  { id: 'night', label: '夜', desc: '深色护眼' },
];

const READER_THEME_BG: Record<ReaderTheme, string> = {
  morning: '#fffcfa',
  sepia: '#f5f0e1',
  night: '#12181c',
};

export function readerThemeBackground(theme: ReaderTheme): string {
  return READER_THEME_BG[theme];
}

export const VERSE_NUMBER_MODES: { id: VerseNumberMode; label: string }[] = [
  { id: 'inline', label: '内嵌' },
  { id: 'margin', label: '行首' },
  { id: 'hidden', label: '隐藏' },
];

function read<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const v = localStorage.getItem(key);
  return (v as T) || fallback;
}

function normalizeReaderTheme(raw: string | null): ReaderTheme {
  if (raw === 'night') return 'night';
  if (raw === 'sepia') return 'sepia';
  return 'morning';
}

export function getReaderTheme(): ReaderTheme {
  if (typeof window === 'undefined') return 'morning';
  const raw = localStorage.getItem(THEME_KEY);
  const theme = normalizeReaderTheme(raw);
  if (raw === 'paper') localStorage.setItem(THEME_KEY, 'morning');
  return theme;
}

export function setReaderTheme(t: ReaderTheme) {
  localStorage.setItem(THEME_KEY, t);
}

export function getVerseNumberMode(): VerseNumberMode {
  return read(VERSE_NO_KEY, 'inline');
}

export function setVerseNumberMode(m: VerseNumberMode) {
  localStorage.setItem(VERSE_NO_KEY, m);
}

export function getReadingLayout(): ReadingLayout {
  return read(LAYOUT_KEY, 'single');
}

export function setReadingLayout(l: ReadingLayout) {
  localStorage.setItem(LAYOUT_KEY, l);
}

export function getParallelVersion(): string {
  return read(PARALLEL_VER_KEY, 'kjv');
}

export function setParallelVersion(id: string) {
  localStorage.setItem(PARALLEL_VER_KEY, id);
}

/** 正文译本 id；null/空 表示默认主译本（和合本）。 */
export function getMainVersion(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(MAIN_VER_KEY);
}

export function setMainVersion(id: string | null) {
  if (id) localStorage.setItem(MAIN_VER_KEY, id);
  else localStorage.removeItem(MAIN_VER_KEY);
}

/** 全书进度：当前卷在 66 卷中的序位 + 章进度。 */
export function bookProgressInBible(
  books: { id: string; chapter_count: number }[],
  bookId: string,
  chapter: number,
): number {
  if (!books.length) return 0;
  let totalCh = 0;
  let before = 0;
  let found = false;
  for (const b of books) {
    totalCh += b.chapter_count;
    if (b.id === bookId) {
      found = true;
      before += chapter - 1;
      break;
    }
    if (!found) before += b.chapter_count;
  }
  return totalCh > 0 ? Math.round((before / totalCh) * 100) : 0;
}
