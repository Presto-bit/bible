/** 彼爱手稿全屏进度：本机记住上次页码，下次续读 */

const PREFIX = 'peiai_manuscript_page_v1:';

function key(tourId: string): string {
  return `${PREFIX}${tourId}`;
}

/** 读取上次页码（0-based）；无记录或越界返回 0 */
export function readManuscriptPage(tourId: string, pageCount?: number): number {
  if (typeof window === 'undefined' || !tourId) return 0;
  try {
    const raw = localStorage.getItem(key(tourId));
    if (raw == null) return 0;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (typeof pageCount === 'number' && pageCount > 0) {
      return Math.min(n, pageCount - 1);
    }
    return n;
  } catch {
    return 0;
  }
}

export function writeManuscriptPage(tourId: string, pageIndex: number): void {
  if (typeof window === 'undefined' || !tourId) return;
  try {
    const n = Math.max(0, Math.floor(pageIndex));
    if (n <= 0) {
      localStorage.removeItem(key(tourId));
      return;
    }
    localStorage.setItem(key(tourId), String(n));
  } catch {
    /* private mode */
  }
}

/** 是否有可续读进度（非封面页） */
export function hasManuscriptResume(tourId: string): boolean {
  return readManuscriptPage(tourId) > 0;
}
