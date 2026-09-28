/** 书架节渲染模式（对齐 docs/SHELF-READING.md） */
import type { ShelfSection } from '@/lib/shelf_api';
import { shelfSectionHtmlLooksLegacy } from '@/lib/shelf_reading';

export type ShelfSectionRenderMode = 'flow' | 'page';

export function shelfSectionRenderMode(section: ShelfSection | null | undefined): ShelfSectionRenderMode {
  if (!section) return 'flow';
  const p = section.primary;
  if (p?.storage_key) {
    const mime = p.mime || '';
    if (mime.includes('pdf') || p.storage_key.toLowerCase().endsWith('.pdf')) {
      return 'page';
    }
  }
  return 'flow';
}

/** 与 ShelfLessonPanel 渲染一致：有可用 HTML 时按流式竖滚，而非 PDF 分页。 */
export function shelfSectionIsPdf(section: ShelfSection | null | undefined): boolean {
  if (!section) return false;
  if (section.html?.trim() && !shelfSectionHtmlLooksLegacy(section)) return false;
  return shelfSectionRenderMode(section) === 'page';
}

const HINT_KEY = 'shelf_reading_hint_v1';
const PDF_ZOOM_HINT_KEY = 'shelf_pdf_zoom_hint_v1';

/** @deprecated 已取消首次进入滑动提示 */
export function maybeShowShelfReadingHint(_flash: (msg: string) => void) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * PDF 首次阅读轻提示（只弹一次）。
 * 文案：双指放大 + 按书记住。
 */
export function maybeShowShelfPdfZoomHint(flash: (msg: string) => void): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(PDF_ZOOM_HINT_KEY)) return;
    localStorage.setItem(PDF_ZOOM_HINT_KEY, '1');
    flash('双指捏合可放大，缩放会按书记住');
  } catch {
    /* ignore */
  }
}

export const SHELF_PDF_ZOOM_KEY = 'shelf_pdf_zoom_v1';
export const SHELF_PDF_ZOOM_BY_BOOK_KEY = 'shelf_pdf_zoom_by_book_v1';
export const SHELF_PDF_ZOOM_DEFAULT = 1.25;
export const SHELF_PDF_ZOOM_MIN = 1;
export const SHELF_PDF_ZOOM_MAX = 2;
export const SHELF_PDF_ZOOM_STEP = 0.25;

function readShelfPdfZoomMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SHELF_PDF_ZOOM_BY_BOOK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out[k] = clampShelfPdfZoom(n);
    }
    return out;
  } catch {
    return {};
  }
}

export function clampShelfPdfZoom(z: number): number {
  if (!Number.isFinite(z)) return SHELF_PDF_ZOOM_DEFAULT;
  return Math.min(SHELF_PDF_ZOOM_MAX, Math.max(SHELF_PDF_ZOOM_MIN, z));
}

/** 读取 PDF 缩放：优先按书 → 全局 → fallback。 */
export function readShelfPdfZoom(
  bookId?: string | null,
  fallback: number = SHELF_PDF_ZOOM_DEFAULT,
): number {
  if (typeof window === 'undefined') return clampShelfPdfZoom(fallback);
  const id = (bookId || '').trim();
  if (id) {
    const byBook = readShelfPdfZoomMap()[id];
    if (typeof byBook === 'number') return byBook;
  }
  try {
    const raw = localStorage.getItem(SHELF_PDF_ZOOM_KEY);
    if (raw) {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) return clampShelfPdfZoom(n);
    }
  } catch {
    /* ignore */
  }
  return clampShelfPdfZoom(fallback);
}

/** 写入 PDF 缩放；有 bookId 时按书记住，并同步全局默认供新书回落。 */
export function writeShelfPdfZoom(zoom: number, bookId?: string | null): void {
  if (typeof window === 'undefined') return;
  const z = clampShelfPdfZoom(zoom);
  try {
    localStorage.setItem(SHELF_PDF_ZOOM_KEY, String(z));
    const id = (bookId || '').trim();
    if (!id) return;
    const map = readShelfPdfZoomMap();
    map[id] = z;
    localStorage.setItem(SHELF_PDF_ZOOM_BY_BOOK_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

const CHILDREN_LESSON_BOOK_ID = '00000000-0000-4000-8000-000000000002';

/** 幼儿/儿童教案：PDF 默认再放大一档 */
export const SHELF_CHILDREN_PDF_BASE_SCALE = 1.55;
export const SHELF_CHILDREN_PDF_DEFAULT_ZOOM = 1.15;

export function shelfIsChildrenLessonBook(
  book: { id?: string; title?: string } | null | undefined,
): boolean {
  if (!book) return false;
  if (book.id === CHILDREN_LESSON_BOOK_ID) return true;
  const title = book.title || '';
  return /幼儿|儿童/.test(title);
}
