/** 书架阅读偏好：与圣经 Tab 共用字号与字体族。 */
import { sanitizePreviewHtml } from './sanitize_html';
import { fontFamilyCss, getFontFamily } from './reader_preferences';

const FONT_KEY = 'readerFont';
export const SHELF_FONT_SIZES = [18, 20, 24] as const;
const DEFAULT_PX = 18;

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

export const SHELF_FONT_STEPS = [
  { px: 18, label: '中' },
  { px: 20, label: '大' },
  { px: 24, label: '特大' },
] as const;

export function shelfReadingStyleVars(fontPx: number): Record<string, string> {
  const family = getFontFamily();
  return {
    ['--shelf-font-size' as string]: `${fontPx}px`,
    ['--shelf-line-height' as string]: fontPx >= 20 ? '1.9' : '1.82',
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
