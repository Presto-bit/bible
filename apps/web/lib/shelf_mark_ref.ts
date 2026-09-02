/** 书架划线/想法锚点：SHELF.{bookId}.{sectionId}.p{page}@{start}-{end} */

import { formatShelfCheckinLabel, getShelfRefLabel, isShelfRef, parseShelfRef } from './shelf_checkin';

export type ParsedShelfMarkRef = {
  bookId: string;
  sectionId: string;
  pageIndex: number;
  spanStart?: number;
  spanEnd?: number;
  raw: string;
};

export function buildShelfMarkRef(
  bookId: string,
  sectionId: string,
  pageIndex: number,
  span?: { start: number; end: number } | null,
): string {
  const base = `SHELF.${bookId}.${sectionId}.p${Math.max(0, pageIndex)}`;
  if (span && span.end > span.start) {
    return `${base}@${span.start}-${span.end}`;
  }
  return base;
}

export function parseShelfMarkRef(ref: string | null | undefined): ParsedShelfMarkRef | null {
  if (!ref || !isShelfRef(ref)) return null;
  const trimmed = ref.trim();
  const [base, spanPart] = trimmed.split('@');

  const pageMatch = base.match(/^SHELF\.(.+)\.p(\d+)$/);
  if (pageMatch) {
    const rest = pageMatch[1];
    const pageIndex = Number(pageMatch[2]);
    const dot = rest.lastIndexOf('.');
    if (dot <= 0 || Number.isNaN(pageIndex)) return null;
    const bookId = rest.slice(0, dot);
    const sectionId = rest.slice(dot + 1);
    if (!bookId || !sectionId) return null;
    let spanStart: number | undefined;
    let spanEnd: number | undefined;
    if (spanPart) {
      const [s, e] = spanPart.split('-').map(Number);
      if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
        spanStart = s;
        spanEnd = e;
      }
    }
    return { bookId, sectionId, pageIndex, spanStart, spanEnd, raw: trimmed };
  }

  const plain = parseShelfRef(trimmed);
  if (!plain) return null;
  return { ...plain, pageIndex: 0, raw: trimmed };
}

export function isShelfMarkRef(ref: string | null | undefined): boolean {
  return parseShelfMarkRef(ref) != null;
}

export function formatShelfMarkRefLabel(
  ref: string,
  bookTitle?: string,
  sectionTitle?: string,
): string {
  const cached = getShelfRefLabel(ref.split('@')[0] ?? ref);
  if (cached) return cached;

  const p = parseShelfMarkRef(ref);
  if (!p) return ref;
  const base = formatShelfCheckinLabel(bookTitle || '书架', sectionTitle || '');
  if (p.pageIndex > 0) return `${base} · 第 ${p.pageIndex + 1} 页`;
  return base;
}

export function shelfMarkHref(ref: string): string {
  const p = parseShelfMarkRef(ref);
  if (!p) return '/shelf';
  const params = new URLSearchParams();
  params.set('section', p.sectionId);
  if (p.pageIndex > 0) params.set('page', String(p.pageIndex));
  return `/shelf/${encodeURIComponent(p.bookId)}?${params.toString()}`;
}

/** 云同步用：去掉 @ 词组偏移。 */
export function shelfSyncRef(ref: string): string {
  return ref.split('@')[0] ?? ref;
}
