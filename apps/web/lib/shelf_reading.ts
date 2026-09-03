/** 书架阅读偏好（与圣经 Tab 独立存储）。 */
import { sanitizePreviewHtml } from './sanitize_html';

const SHELF_FONT_KEY = 'shelf_font_px';
const SHELF_FONT_FAMILY_KEY = 'shelf_font_family';
const LINE_HEIGHT_KEY = 'shelf_line_height';
const LINE_HEIGHT_MANUAL_KEY = 'shelf_line_height_manual';

export const SHELF_FONT_SIZES = [18, 20, 24] as const;
const DEFAULT_PX = 18;
const DEFAULT_LINE_HEIGHT = 1.9;

export type ShelfFontFamily = 'serif' | 'sans';

export const SHELF_FONT_FAMILIES: { id: ShelfFontFamily; label: string; css: string }[] = [
  { id: 'serif', label: '衬线', css: "Georgia, 'Songti SC', 'STSong', serif" },
  { id: 'sans', label: '黑体', css: "system-ui, -apple-system, 'PingFang SC', sans-serif" },
];

export const SHELF_LINE_HEIGHT_STEPS = [
  { value: 1.75, label: '紧凑' },
  { value: 1.9, label: '标准' },
  { value: 2.05, label: '宽松' },
  { value: 2.2, label: '更宽' },
] as const;

export function getShelfFontPx(): number {
  if (typeof window === 'undefined') return DEFAULT_PX;
  const n = Number(localStorage.getItem(SHELF_FONT_KEY));
  if (SHELF_FONT_SIZES.includes(n as (typeof SHELF_FONT_SIZES)[number])) return n;
  return DEFAULT_PX;
}

export function setShelfFontPx(px: number) {
  if (typeof window === 'undefined') return;
  const nearest = SHELF_FONT_SIZES.reduce((a, b) =>
    Math.abs(b - px) < Math.abs(a - px) ? b : a,
  );
  localStorage.setItem(SHELF_FONT_KEY, String(nearest));
  if (!getShelfLineHeightManual()) {
    setShelfLineHeight(shelfDefaultLineHeight(nearest), { manual: false });
  }
}

export function getShelfFontFamily(): ShelfFontFamily {
  if (typeof window === 'undefined') return 'serif';
  const v = localStorage.getItem(SHELF_FONT_FAMILY_KEY);
  return v === 'sans' ? 'sans' : 'serif';
}

export function setShelfFontFamily(family: ShelfFontFamily) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SHELF_FONT_FAMILY_KEY, family);
}

export function shelfFontFamilyCss(family: ShelfFontFamily = getShelfFontFamily()): string {
  return SHELF_FONT_FAMILIES.find((x) => x.id === family)?.css ?? SHELF_FONT_FAMILIES[0].css;
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

export function shelfDefaultLineHeight(fontPx: number): number {
  return fontPx >= 24 ? 2.05 : 1.9;
}

export function getShelfLineHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_LINE_HEIGHT;
  const n = Number(localStorage.getItem(LINE_HEIGHT_KEY));
  if (SHELF_LINE_HEIGHT_STEPS.some((s) => s.value === n)) return n;
  return shelfDefaultLineHeight(getShelfFontPx());
}

export function getShelfLineHeightManual(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(LINE_HEIGHT_MANUAL_KEY) === '1';
}

export function setShelfLineHeight(value: number, opts?: { manual?: boolean }) {
  if (typeof window === 'undefined') return;
  const nearest = SHELF_LINE_HEIGHT_STEPS.reduce((a, b) =>
    Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a,
  );
  localStorage.setItem(LINE_HEIGHT_KEY, String(nearest.value));
  if (opts?.manual !== false) {
    localStorage.setItem(LINE_HEIGHT_MANUAL_KEY, '1');
  }
}

export const SHELF_FONT_STEPS = [
  { px: 18, label: '中' },
  { px: 20, label: '大' },
  { px: 24, label: '特大' },
] as const;

export function shelfReadingStyleVars(fontPx: number, lineHeight?: number): Record<string, string> {
  const family = getShelfFontFamily();
  const lh = lineHeight ?? getShelfLineHeight();
  return {
    ['--shelf-font-size' as string]: `${fontPx}px`,
    ['--shelf-line-height' as string]: String(lh),
    ['--shelf-font-family' as string]: shelfFontFamilyCss(family),
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
  "p[style-name='Normal'] => p.shelf-docx-p:fresh",
  "p[style-name='正文'] => p.shelf-docx-p:fresh",
  "p[style-name='Body Text'] => p.shelf-docx-p:fresh",
  "p[style-name='List Paragraph'] => p.shelf-docx-p:fresh",
  "p[style-name='列表段落'] => p.shelf-docx-p:fresh",
  "p[style-name='Quote'] => blockquote.shelf-docx-quote:fresh",
  "p[style-name='引用'] => blockquote.shelf-docx-quote:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
];

const SHELF_DOCX_LAYOUT_STYLE_KEYS = new Set([
  'margin-left',
  'margin-right',
  'margin-top',
  'margin-bottom',
  'margin',
  'padding-left',
  'padding-right',
  'padding-top',
  'padding-bottom',
  'padding',
  'width',
  'max-width',
  'min-width',
  'text-indent',
  'left',
  'right',
  'top',
  'float',
  'position',
]);

function stripShelfDocxInlineStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.split(':')[0]?.trim().toLowerCase() ?? '';
      return !(
        key.startsWith('font-size')
        || key.startsWith('font-family')
        || key.startsWith('line-height')
        || key.startsWith('color')
        || key.startsWith('letter-spacing')
        || key.startsWith('mso-')
        || SHELF_DOCX_LAYOUT_STYLE_KEYS.has(key)
      );
    })
    .join('; ');
}

const SHELF_DOCX_NO_INDENT =
  '.shelf-docx-title, .shelf-docx-h1, .shelf-docx-h2, .shelf-docx-h3, .shelf-docx-quote, .shelf-docx-list, .shelf-docx-table-wrap';

function normalizeShelfDocxParagraphIndent(p: Element) {
  if (p.matches(SHELF_DOCX_NO_INDENT)) return;
  if (p.closest('li, td, th')) return;
  const raw = (p.textContent || '').replace(/\u00a0/g, ' ');
  const style = p.getAttribute('style') || '';
  const marginLeft = /margin-left\s*:\s*([\d.]+)(pt|px|em|%)/i.exec(style)?.[1];
  if (/^[\s\u3000]{2,}/.test(raw) || (marginLeft && parseFloat(marginLeft) >= 12)) {
    p.classList.add('shelf-docx-indent');
    if (/^[\s\u3000]+/.test(raw)) {
      p.textContent = raw.replace(/^[\s\u3000]+/, '');
    }
  }
}

export function adaptShelfDocxHtml(raw: string, opts?: { lesson?: boolean }): string {
  const base = sanitizePreviewHtml(raw);
  if (typeof window === 'undefined' || !base) return base;
  try {
    const doc = new DOMParser().parseFromString(`<div id="shelf-docx-root">${base}</div>`, 'text/html');
    const root = doc.getElementById('shelf-docx-root');
    if (!root) return base;
    if (opts?.lesson) root.classList.add('shelf-docx-lesson-root');

    root.querySelectorAll('table').forEach((table) => {
      if (table.parentElement?.classList.contains('shelf-docx-table-wrap')) return;
      const wrap = doc.createElement('div');
      wrap.className = 'shelf-docx-table-wrap';
      table.classList.add('shelf-docx-table');
      table.removeAttribute('width');
      table.removeAttribute('height');
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
      else {
        if (!p.classList.length) p.classList.add('shelf-docx-p');
        if (opts?.lesson) normalizeShelfDocxParagraphIndent(p);
      }
    });

    root.querySelectorAll('h1').forEach((h) => {
      if (!h.classList.length) h.classList.add('shelf-docx-title');
    });
    root.querySelectorAll('h2').forEach((h) => {
      if (!h.classList.length) h.classList.add('shelf-docx-h1');
    });
    root.querySelectorAll('h3').forEach((h) => {
      if (!h.classList.length) h.classList.add('shelf-docx-h2');
    });
    root.querySelectorAll('h4').forEach((h) => {
      if (!h.classList.length) h.classList.add('shelf-docx-h3');
    });

    root.querySelectorAll('strong, b').forEach((el) => {
      el.classList.add('shelf-docx-strong');
    });

    root.querySelectorAll('blockquote').forEach((bq) => {
      bq.classList.add('shelf-docx-quote');
    });

    root.querySelectorAll('li').forEach((li) => {
      if (!li.classList.length) li.classList.add('shelf-docx-li');
    });

    root.querySelectorAll('[style]').forEach((el) => {
      const cleaned = stripShelfDocxInlineStyle(el.getAttribute('style') || '');
      if (cleaned) el.setAttribute('style', cleaned);
      else el.removeAttribute('style');
    });

    root.querySelectorAll('div').forEach((div) => {
      if (
        div === root
        || div.classList.contains('shelf-docx-table-wrap')
        || div.classList.contains('shelf-docx-root')
      ) return;
      if (div.querySelector('table, ul, ol, img, h1, h2, h3, h4, blockquote')) return;
      const p = doc.createElement('p');
      p.className = 'shelf-docx-p';
      p.innerHTML = div.innerHTML;
      div.replaceWith(p);
    });

    return root.innerHTML;
  } catch {
    return base;
  }
}

/** 旧版纯文本抽取未盖 `shelf-docx-root`，应回退 Mammoth / 重新拉 API。 */
export function shelfSectionHtmlLooksLegacy(section: {
  html: string;
  kind?: string;
  primary?: { mime?: string; storage_key: string } | null;
}): boolean {
  const primary = section.primary;
  const isDocx =
    section.kind === 'lesson'
    || Boolean(
      primary
      && (
        (primary.mime || '').includes('wordprocessingml')
        || primary.storage_key.toLowerCase().endsWith('.docx')
      ),
    );
  if (!isDocx) return false;
  return !section.html.includes('shelf-docx-root');
}
