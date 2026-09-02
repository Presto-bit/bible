import { getJson, API_BASE } from './api_core';

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
  return getJson<{ groups: ShelfGroup[]; items: ShelfBookSummary[] }>('/shelf/platform');
}

export async function getPlatformShelfBook(id: string): Promise<ShelfBookDetail> {
  return getJson<ShelfBookDetail>(`/shelf/platform/${encodeURIComponent(id)}`);
}

export async function getPlatformShelfSection(bookId: string, sectionId: string): Promise<ShelfSection> {
  return getJson<ShelfSection>(
    `/shelf/platform/${encodeURIComponent(bookId)}/sections/${encodeURIComponent(sectionId)}`,
  );
}

export function shelfCoverHue(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i += 1) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return h % 360;
}

const PROGRESS_KEY = 'presto_shelf_progress_v1';

export function loadShelfProgress(bookId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[bookId] ?? null;
  } catch {
    return null;
  }
}

export function saveShelfProgress(bookId: string, sectionId: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, string>;
    map[bookId] = sectionId;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
