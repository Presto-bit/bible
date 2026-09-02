import { getJson, API_BASE } from './api_core';
import {
  fetchShelfBook,
  fetchShelfList,
  fetchShelfSection,
  invalidateShelfListCache,
  peekShelfSectionCache,
  prefetchShelfSection,
} from './shelf_cache';

export { invalidateShelfListCache, peekShelfSectionCache, prefetchShelfSection };

export type ShelfTocItem = {
  id: string;
  title: string;
  level: number;
  zone: 'front' | 'body' | 'appendix' | string;
  source?: string;
  confidence?: number;
  section_id?: string | null;
};

export type ShelfBookSummary = {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  mime: string;
  file_size: number;
  section_count: number;
  book_type?: 'document' | 'collection' | string;
  group_id?: string;
  sort_order?: number;
  source: 'platform' | 'local';
};

export type ShelfGroup = {
  id: string;
  title: string;
  sort_order?: number;
};

export type ShelfAttachment = {
  id: string;
  title: string;
  kind: 'image' | 'video' | string;
  storage_key: string;
  mime: string;
};

export type ShelfPrimaryAsset = {
  storage_key: string;
  mime: string;
  title?: string;
};

export type ShelfBookDetail = ShelfBookSummary & {
  toc: {
    front?: ShelfTocItem[];
    outline?: ShelfTocItem[];
    body?: ShelfTocItem[];
    appendix?: ShelfTocItem[];
  };
  sections?: {
    id: string;
    title: string;
    zone?: string;
    level?: number;
    kind?: string;
    unit?: string;
  }[];
};

export type ShelfSection = {
  id: string;
  title: string;
  zone?: string;
  level?: number;
  kind?: 'html' | 'lesson' | string;
  unit?: string;
  html: string;
  primary?: ShelfPrimaryAsset | null;
  attachments?: ShelfAttachment[];
};

export function shelfAssetUrl(bookId: string, storageKey: string): string {
  const key = encodeURIComponent(storageKey.split('/').pop() || storageKey);
  return `${API_BASE}/shelf/platform/${encodeURIComponent(bookId)}/files/${key}`;
}

export async function listPlatformShelf(): Promise<ShelfBookSummary[]> {
  const data = await listPlatformShelfFull();
  return data.items ?? [];
}

export async function listPlatformShelfFull(): Promise<{ groups: ShelfGroup[]; items: ShelfBookSummary[] }> {
  const data = await fetchShelfList();
  return { groups: data.groups, items: data.items };
}

export async function getPlatformShelfBook(id: string): Promise<ShelfBookDetail> {
  return fetchShelfBook(id);
}

export async function getPlatformShelfSection(bookId: string, sectionId: string): Promise<ShelfSection> {
  return fetchShelfSection(bookId, sectionId);
}

export function shelfCoverHue(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i += 1) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return h % 360;
}

const PROGRESS_KEY = 'presto_shelf_progress_v1';

export type ShelfBookProgress = {
  sectionId: string;
  /** PDF：0-based 页码 */
  pageIndex?: number;
  /** HTML/Word flow：0–1 滚动比例 */
  scrollOffset?: number;
};

export type ShelfLastRead = {
  bookId: string;
  sectionId: string;
  bookTitle: string;
  sectionTitle: string;
  pageIndex?: number;
  at: number;
};

type ShelfProgressStore = {
  byBook: Record<string, ShelfBookProgress | string>;
  last?: ShelfLastRead;
};

function normalizeBookProgress(raw: ShelfBookProgress | string | undefined): ShelfBookProgress | null {
  if (!raw) return null;
  if (typeof raw === 'string') return { sectionId: raw, pageIndex: 0 };
  if (typeof raw.sectionId === 'string') {
    return {
      sectionId: raw.sectionId,
      pageIndex: typeof raw.pageIndex === 'number' ? raw.pageIndex : 0,
      scrollOffset: typeof raw.scrollOffset === 'number' ? raw.scrollOffset : undefined,
    };
  }
  return null;
}

function readProgressStore(): ShelfProgressStore {
  if (typeof window === 'undefined') return { byBook: {} };
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { byBook: {} };
    const parsed = JSON.parse(raw) as ShelfProgressStore | Record<string, string>;
    if (parsed && typeof parsed === 'object' && 'byBook' in parsed) {
      return parsed as ShelfProgressStore;
    }
    return { byBook: parsed as Record<string, string> };
  } catch {
    return { byBook: {} };
  }
}

function writeProgressStore(store: ShelfProgressStore) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function loadShelfProgress(bookId: string): string | null {
  return loadShelfBookProgress(bookId)?.sectionId ?? null;
}

export function loadShelfBookProgress(bookId: string): ShelfBookProgress | null {
  return normalizeBookProgress(readProgressStore().byBook[bookId]);
}

export function loadShelfLastRead(): ShelfLastRead | null {
  return readProgressStore().last ?? null;
}

export function saveShelfProgress(
  bookId: string,
  sectionId: string,
  meta?: { bookTitle?: string; sectionTitle?: string },
  position?: { pageIndex?: number; scrollOffset?: number },
) {
  const pageIndex = Math.max(0, position?.pageIndex ?? 0);
  const scrollOffset =
    typeof position?.scrollOffset === 'number'
      ? Math.min(1, Math.max(0, position.scrollOffset))
      : undefined;
  const store = readProgressStore();
  store.byBook[bookId] = {
    sectionId,
    pageIndex,
    ...(scrollOffset != null ? { scrollOffset } : {}),
  };
  if (meta?.bookTitle) {
    store.last = {
      bookId,
      sectionId,
      bookTitle: meta.bookTitle,
      sectionTitle: meta.sectionTitle || '',
      pageIndex,
      at: Date.now(),
    };
  }
  writeProgressStore(store);
}
