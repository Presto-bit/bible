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

export function maybeShowShelfReadingHint(flash: (msg: string) => void) {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(HINT_KEY)) return;
    localStorage.setItem(HINT_KEY, '1');
    flash('上下滑动阅读，左右切换章节');
  } catch {
    /* ignore */
  }
}
