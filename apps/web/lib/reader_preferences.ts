// 阅读器扩展偏好：字体、翻页、划线/想法开关、阅读模式等。

export type ReaderFontFamily = 'serif' | 'sans';
export type PageTurnMode = 'swipe' | 'scroll';
/** 专注=少干扰；默想=读后留痕；查经=工具齐全（默认） */
export type ReadingMode = 'focus' | 'meditate' | 'study';

const FONT_FAMILY_KEY = 'reader_font_family';
const PAGE_TURN_KEY = 'reader_page_turn';
const UNDERLINES_OFF_KEY = 'reader_underlines_off';
const THOUGHTS_OFF_KEY = 'reader_thoughts_off';
const READING_MODE_KEY = 'reader_reading_mode';
const PARALLEL_DIFF_KEY = 'reader_parallel_diff';
const CHAPTER_COMPLETE_TIP_OFF_KEY = 'reader_chapter_complete_tip_off';

function read(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export const FONT_FAMILIES: { id: ReaderFontFamily; label: string; css: string }[] = [
  { id: 'serif', label: '衬线', css: "Georgia, 'Songti SC', 'STSong', serif" },
  { id: 'sans', label: '黑体', css: "system-ui, -apple-system, 'PingFang SC', sans-serif" },
];

export const PAGE_TURN_MODES: { id: PageTurnMode; label: string }[] = [
  { id: 'swipe', label: '跟手翻页' },
  { id: 'scroll', label: '上下滚动' },
];

export function getFontFamily(): ReaderFontFamily {
  const v = read(FONT_FAMILY_KEY, 'serif');
  return v === 'sans' ? 'sans' : 'serif';
}

export function setFontFamily(f: ReaderFontFamily) {
  localStorage.setItem(FONT_FAMILY_KEY, f);
}

export function fontFamilyCss(f: ReaderFontFamily): string {
  return FONT_FAMILIES.find((x) => x.id === f)?.css ?? FONT_FAMILIES[0].css;
}

function defaultPageTurn(): PageTurnMode {
  if (typeof window === 'undefined') return 'swipe';
  // 安卓壳务必横滑翻页（部分机报 fine pointer，勿默认 scroll）
  if (/PeiaiAndroidShell\//i.test(navigator.userAgent)) return 'swipe';
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return 'scroll';
  return 'swipe';
}

export function getPageTurn(): PageTurnMode {
  const saved = read(PAGE_TURN_KEY, '');
  if (saved === 'scroll' || saved === 'swipe') return saved;
  return defaultPageTurn();
}

export function setPageTurn(p: PageTurnMode) {
  localStorage.setItem(PAGE_TURN_KEY, p);
}

export function getUnderlinesOn(): boolean {
  return read(UNDERLINES_OFF_KEY, '0') !== '1';
}

export function setUnderlinesOn(on: boolean) {
  localStorage.setItem(UNDERLINES_OFF_KEY, on ? '0' : '1');
}

export function getThoughtsOn(): boolean {
  return read(THOUGHTS_OFF_KEY, '0') !== '1';
}

export function setThoughtsOn(on: boolean) {
  localStorage.setItem(THOUGHTS_OFF_KEY, on ? '0' : '1');
}

export const READING_MODES: { id: ReadingMode; label: string; hint: string }[] = [
  { id: 'focus', label: '专注', hint: '少干扰，适合连续读' },
  { id: 'meditate', label: '默想', hint: '读后留一句回应' },
  { id: 'study', label: '查经', hint: '工具齐全（默认）' },
];

export function getReadingMode(): ReadingMode {
  const v = read(READING_MODE_KEY, 'study');
  if (v === 'focus' || v === 'meditate' || v === 'study') return v;
  return 'study';
}

export function setReadingMode(m: ReadingMode) {
  localStorage.setItem(READING_MODE_KEY, m);
}

export function getShowParallelDiff(): boolean {
  return read(PARALLEL_DIFF_KEY, '0') === '1';
}

export function setShowParallelDiff(on: boolean) {
  localStorage.setItem(PARALLEL_DIFF_KEY, on ? '1' : '0');
}

export function getChapterCompleteTipOn(): boolean {
  return read(CHAPTER_COMPLETE_TIP_OFF_KEY, '0') !== '1';
}

export function setChapterCompleteTipOn(on: boolean) {
  localStorage.setItem(CHAPTER_COMPLETE_TIP_OFF_KEY, on ? '0' : '1');
}
