/** 书架阅读偏好与 DOCX 可读性适配。 */
import { sanitizePreviewHtml } from './sanitize_html';

const FONT_KEY = 'shelf_font_px';
const MIN_PX = 15;
const MAX_PX = 22;
const DEFAULT_PX = 18;

export function getShelfFontPx(): number {
  if (typeof window === 'undefined') return DEFAULT_PX;
  const n = Number(localStorage.getItem(FONT_KEY));
  if (!Number.isFinite(n)) return DEFAULT_PX;
  return Math.min(MAX_PX, Math.max(MIN_PX, Math.round(n)));
}

export function setShelfFontPx(px: number) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FONT_KEY, String(Math.min(MAX_PX, Math.max(MIN_PX, Math.round(px)))));
}

export function bumpShelfFontPx(delta: number): number {
  const next = getShelfFontPx() + delta;
  setShelfFontPx(next);
  return getShelfFontPx();
}

export const SHELF_FONT_STEPS = [
  { px: 15, label: '小' },
  { px: 18, label: '中' },
  { px: 22, label: '大' },
] as const;

export function shelfReadingStyleVars(fontPx: number): Record<string, string> {
  return {
    ['--shelf-font-size' as string]: `${fontPx}px`,
    ['--shelf-line-height' as string]: fontPx >= 20 ? '1.9' : '1.82',
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
      else p.classList.add('shelf-docx-p');
    });

    root.querySelectorAll('h1,h2,h3,h4').forEach((h) => {
      if (!h.classList.length) h.classList.add('shelf-docx-h1');
    });

    return root.innerHTML;
  } catch {
    return base;
  }
}
