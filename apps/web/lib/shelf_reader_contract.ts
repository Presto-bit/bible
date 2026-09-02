/** 书架节渲染模式（对齐 docs/SHELF-READING.md） */
import type { ShelfSection } from '@/lib/shelf_api';

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

export function shelfSectionIsPdf(section: ShelfSection | null | undefined): boolean {
  return shelfSectionRenderMode(section) === 'page';
}

const HINT_KEY = 'shelf_reading_hint_v1';

/** @deprecated 已取消首次进入滑动提示 */
export function maybeShowShelfReadingHint(_flash: (msg: string) => void) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export const SHELF_PDF_ZOOM_KEY = 'shelf_pdf_zoom_v1';
export const SHELF_PDF_ZOOM_DEFAULT = 1.25;
export const SHELF_PDF_ZOOM_MIN = 1;
export const SHELF_PDF_ZOOM_MAX = 2;
export const SHELF_PDF_ZOOM_STEP = 0.25;

export function readShelfPdfZoom(): number {
  if (typeof window === 'undefined') return SHELF_PDF_ZOOM_DEFAULT;
  try {
    const raw = localStorage.getItem(SHELF_PDF_ZOOM_KEY);
    const n = raw ? parseFloat(raw) : SHELF_PDF_ZOOM_DEFAULT;
    if (!Number.isFinite(n)) return SHELF_PDF_ZOOM_DEFAULT;
    return Math.min(SHELF_PDF_ZOOM_MAX, Math.max(SHELF_PDF_ZOOM_MIN, n));
  } catch {
    return SHELF_PDF_ZOOM_DEFAULT;
  }
}

export function clampShelfPdfZoom(z: number): number {
  if (!Number.isFinite(z)) return SHELF_PDF_ZOOM_DEFAULT;
  return Math.min(SHELF_PDF_ZOOM_MAX, Math.max(SHELF_PDF_ZOOM_MIN, z));
}
