// 阅读器扩展偏好：字体、翻页、划线/想法开关。

export type ReaderFontFamily = 'serif' | 'sans';
export type PageTurnMode = 'swipe' | 'scroll';

const FONT_FAMILY_KEY = 'reader_font_family';
const PAGE_TURN_KEY = 'reader_page_turn';
const UNDERLINES_OFF_KEY = 'reader_underlines_off';
const THOUGHTS_OFF_KEY = 'reader_thoughts_off';

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
