/** 书架阅读偏好：与圣经 Tab 共用字号与字体族。 */
import { sanitizePreviewHtml } from './sanitize_html';
import { fontFamilyCss, getFontFamily } from './reader_preferences';

const FONT_KEY = 'readerFont';
const LINE_HEIGHT_KEY = 'shelf_line_height';
export const SHELF_FONT_SIZES = [18, 20, 24] as const;
const DEFAULT_PX = 18;
const DEFAULT_LINE_HEIGHT = 1.9;

export const SHELF_LINE_HEIGHT_STEPS = [
  { value: 1.75, label: '紧凑' },
  { value: 1.9, label: '标准' },
  { value: 2.05, label: '宽松' },
  { value: 2.2, label: '更宽' },
] as const;

export function getShelfFontPx(): number {
  if (typeof window === 'undefined') return DEFAULT_PX;
  const n = Number(localStorage.getItem(FONT_KEY));
  if (SHELF_FONT_SIZES.includes(n as (typeof SHELF_FONT_SIZES)[number])) return n;
  return DEFAULT_PX;
}

export function setShelfFontPx(px: number) {
  if (typeof window === 'undefined') return;
  const nearest = SHELF_FONT_SIZES.reduce((a, b) =>
    Math.abs(b - px) < Math.abs(a - px) ? b : a,
  );
  localStorage.setItem(FONT_KEY, String(nearest));
}

export function bumpShelfFontPx(delta: number): number {
  const current = getShelfFontPx();
  const idx = SHELF_FONT_SIZES.indexOf(current as (typeof SHELF_FONT_SIZES)[number]);
  const base = idx >= 0 ? idx : 0;
  const next = SHELF_FONT_SIZES[Math.min(SHELF_FONT_SIZES.length - 1, Math.max(0, base + (delta > 0 ? 1 : -1)))];
  setShelfFontPx(next);
  return next;
}

export function cycleShelfFontPx(): number {
  const current = getShelfFontPx();
  const idx = SHELF_FONT_SIZES.indexOf(current as (typeof SHELF_FONT_SIZES)[number]);
  const base = idx >= 0 ? idx : 0;
  const next = SHELF_FONT_SIZES[(base + 1) % SHELF_FONT_SIZES.length];
  setShelfFontPx(next);
  return next;
}

/** 默认行高（无用户偏好时，与圣经 Tab 散文一致） */
export function shelfDefaultLineHeight(fontPx: number): number {
  return fontPx >= 24 ? 2.05 : 1.9;
}

export function getShelfLineHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_LINE_HEIGHT;
  const n = Number(localStorage.getItem(LINE_HEIGHT_KEY));
  if (SHELF_LINE_HEIGHT_STEPS.some((s) => s.value === n)) return n;
  return shelfDefaultLineHeight(getShelfFontPx());
}

export function setShelfLineHeight(value: number) {
  if (typeof window === 'undefined') return;
  const nearest = SHELF_LINE_HEIGHT_STEPS.reduce((a, b) =>
    Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a,
  );
  localStorage.setItem(LINE_HEIGHT_KEY, String(nearest.value));
}

export const SHELF_FONT_STEPS = [
  { px: 18, label: '中' },
  { px: 20, label: '大' },
  { px: 24, label: '特大' },
] as const;

export function shelfReadingStyleVars(fontPx: number, lineHeight?: number): Record<string, string> {
  const family = getFontFamily();
  const lh = lineHeight ?? getShelfLineHeight();
  return {
    ['--reader-font-size' as string]: `${fontPx}px`,
    ['--shelf-font-size' as string]: `${fontPx}px`,
    ['--shelf-line-height' as string]: String(lh),
    ['--shelf-font-family' as string]: fontFamilyCss(family),
  };
}

/** Mammoth 样式映射：Word 教案 → 书架排版类名 */
export const SHELF_DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1.shelf-docx-title:fresh",
  "p[style-name='标题'] => h1.shelf-docx-title:fresh",
  "p[style-name='Heading 1'] => h2.shelf-docx-h1:fresh",
  "p[style-name='Heading 2'] => h3.shelf-docx-h2:fresh",
  "p[style-name='Heading 3'] => h4.shelf-docx-h3:fresh",
  "p[style-name='标题 1'] => h2.shelf-docx-h1:fresh",
  "p[style-name='标题 2'] => h3.shelf-docx-h2:fresh",
  "p[style-name='标题 3'] => h4.shelf-docx-h3:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
];

export function adaptShelfDocxHtml(raw: string): string {
  const base = sanitizePreviewHtml(raw);
  if (typeof window === 'undefined' || !base) return base;
  try {
    const doc = new DOMParser().parseFromString(`<div id="shelf-docx-root">${base}</div>`, 'text/html');
    const root = doc.getElementById('shelf-docx-root');
    if (!root) return base;

    root.querySelectorAll('table').forEach((table) => {
      if (table.parentElement?.classList.contains('shelf-docx-table-wrap')) return;
      const wrap = doc.createElement('div');
      wrap.className = 'shelf-docx-table-wrap';
      table.classList.add('shelf-docx-table');
      table.parentNode?.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    root.querySelectorAll('img').forEach((img) => {
      img.classList.add('shelf-docx-img');
      img.removeAttribute('width');
      img.removeAttribute('height');
    });

    root.querySelectorAll('ul, ol').forEach((list) => {
      list.classList.add('shelf-docx-list');
    });

    root.querySelectorAll('p').forEach((p) => {
      const text = (p.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (!text && !p.querySelector('img, table')) p.remove();
      else if (!p.classList.length) p.classList.add('shelf-docx-p');
    });

    root.querySelectorAll('h1,h2,h3,h4').forEach((h) => {
      if (!h.classList.length) h.classList.add('shelf-docx-h1');
    });

    root.querySelectorAll('strong, b').forEach((el) => {
      el.classList.add('shelf-docx-strong');
    });

    return root.innerHTML;
  } catch {
    return base;
  }
}
