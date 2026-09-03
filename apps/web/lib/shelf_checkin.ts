/** 书架阅读打卡 ref：SHELF.{bookId}.{sectionId} */

import { GROUP_CHECKIN_BODY_MAX, normalizeCheckinBody } from './group_checkin';

export { GROUP_CHECKIN_BODY_MAX, normalizeCheckinBody };

export const SHELF_CHECKIN_CHIPS = [
  '读到这里很有感触 🙏',
  '完成本节 ✓',
  '愿与弟兄共勉',
] as const;

const LABEL_KEY = 'presto_shelf_ref_labels_v1';

type LabelStore = Record<string, string>;

function readLabelStore(): LabelStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LABEL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LabelStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLabelStore(store: LabelStore) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LABEL_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function buildShelfCheckinRef(
  bookId: string,
  sectionId: string,
  pageIndex?: number,
): string {
  const base = `SHELF.${bookId}.${sectionId}`;
  if (typeof pageIndex === 'number' && pageIndex > 0) return `${base}.p${pageIndex}`;
  return base;
}

/** bookId 可含 UUID 连字符；sectionId 为最后一段；可选 `.p{n}` 页码后缀。 */
export function parseShelfRef(
  ref: string | null | undefined,
): { bookId: string; sectionId: string; pageIndex?: number } | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed.startsWith('SHELF.')) return null;
  let rest = trimmed.slice(6);
  let pageIndex: number | undefined;
  const pageMatch = rest.match(/\.p(\d+)$/);
  if (pageMatch) {
    pageIndex = Number(pageMatch[1]);
    rest = rest.slice(0, -pageMatch[0].length);
  }
  const dot = rest.lastIndexOf('.');
  if (dot <= 0) return null;
  const bookId = rest.slice(0, dot);
  const sectionId = rest.slice(dot + 1);
  if (!bookId || !sectionId) return null;
  return { bookId, sectionId, pageIndex };
}

export function isShelfRef(ref: string | null | undefined): boolean {
  return parseShelfRef(ref) !== null;
}

export function rememberShelfRefLabel(ref: string, label: string) {
  if (!ref || !label.trim()) return;
  const store = readLabelStore();
  store[ref] = label.trim();
  writeLabelStore(store);
}

export function getShelfRefLabel(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return readLabelStore()[ref] ?? null;
}

export function formatShelfCheckinLabel(
  bookTitle: string,
  sectionTitle: string,
): string {
  const book = bookTitle.trim();
  const section = sectionTitle.trim();
  if (book && section) return `《${book}》· ${section}`;
  if (book) return `《${book}》`;
  return section || '书架阅读';
}

export function shelfHrefFromRef(
  ref: string,
  opts?: { group?: string; task?: string; pageIndex?: number },
): string | null {
  const parsed = parseShelfRef(ref);
  if (!parsed) return null;
  const params = new URLSearchParams({ section: parsed.sectionId });
  const page = opts?.pageIndex ?? parsed.pageIndex;
  if (typeof page === 'number' && page > 0) params.set('page', String(page));
  if (opts?.group) params.set('group', opts.group);
  if (opts?.task) params.set('task', opts.task);
  return `/shelf/${encodeURIComponent(parsed.bookId)}/read?${params.toString()}`;
}

/** 本地无缓存时拉取书目/章节标题并写入缓存。 */
export async function ensureShelfRefLabel(ref: string): Promise<string> {
  const cached = getShelfRefLabel(ref);
  if (cached) return cached;
  const parsed = parseShelfRef(ref);
  if (!parsed) return '书架阅读';
  try {
    const { getPlatformShelfBook, getPlatformShelfSection } = await import('./shelf_api');
    const [book, section] = await Promise.all([
      getPlatformShelfBook(parsed.bookId),
      getPlatformShelfSection(parsed.bookId, parsed.sectionId),
    ]);
    const label = formatShelfCheckinLabel(book.title, section.title);
    rememberShelfRefLabel(ref, label);
    return label;
  } catch {
    return '书架阅读';
  }
}
