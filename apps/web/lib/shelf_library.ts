/** 用户书架视图：分组 Tab、排序、本地 meta（P1 云端前 local-first）。 */

import {
  loadShelfBookProgress,
  loadShelfLastRead,
  type ShelfBookSummary,
} from './shelf_api';

export const SHELF_LIBRARY_KEY = 'presto_shelf_library_v1';
export const SHELF_MAX_USER_GROUPS = 8;
export const SHELF_IMPORT_MAX_BYTES = 20 * 1024 * 1024;

export type ShelfProgressFilter = 'reading' | 'finished' | 'unread';

export type ShelfLibraryTab =
  | { kind: 'last_read' }
  | { kind: 'progress'; status: ShelfProgressFilter }
  | { kind: 'added' }
  | { kind: 'group'; groupId: string };

export type ShelfUserGroup = {
  id: string;
  title: string;
  sortOrder: number;
  createdAt: number;
};

export type ShelfBookLibraryMeta = {
  groupId: string | null;
  addedAt: number;
  lastReadAt: number | null;
  hidden?: boolean;
};

type ShelfLibraryStore = {
  groups: ShelfUserGroup[];
  books: Record<string, ShelfBookLibraryMeta>;
};

export const SHELF_UNGROUPED_ID = '_ungrouped';
const FINISH_RATIO = 0.97;

function readStore(): ShelfLibraryStore {
  if (typeof window === 'undefined') return { groups: [], books: {} };
  try {
    const raw = localStorage.getItem(SHELF_LIBRARY_KEY);
    if (!raw) return { groups: [], books: {} };
    const parsed = JSON.parse(raw) as ShelfLibraryStore;
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      books: parsed.books && typeof parsed.books === 'object' ? parsed.books : {},
    };
  } catch {
    return { groups: [], books: {} };
  }
}

function writeStore(store: ShelfLibraryStore) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHELF_LIBRARY_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function newGroupId() {
  return `ug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function listShelfUserGroups(): ShelfUserGroup[] {
  return [...readStore().groups].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function ensureShelfBookMeta(bookId: string): ShelfBookLibraryMeta {
  const store = readStore();
  const existing = store.books[bookId];
  if (existing) return existing;
  const last = loadShelfLastRead();
  const now = Date.now();
  const meta: ShelfBookLibraryMeta = {
    groupId: null,
    addedAt: last?.bookId === bookId && last.at ? last.at : now,
    lastReadAt: last?.bookId === bookId ? last.at : null,
  };
  store.books[bookId] = meta;
  writeStore(store);
  return meta;
}

export function syncShelfLibraryFromBooks(books: ShelfBookSummary[]) {
  const store = readStore();
  let dirty = false;
  const last = loadShelfLastRead();
  for (const book of books) {
    if (!store.books[book.id]) {
      store.books[book.id] = {
        groupId: null,
        addedAt: Date.now(),
        lastReadAt: null,
      };
      dirty = true;
    }
    const meta = store.books[book.id];
    if (last?.bookId === book.id && last.at) {
      if (meta.lastReadAt !== last.at) {
        meta.lastReadAt = last.at;
        dirty = true;
      }
    }
  }
  if (dirty) writeStore(store);
}

export function createShelfUserGroup(title: string): ShelfUserGroup | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const store = readStore();
  if (store.groups.length >= SHELF_MAX_USER_GROUPS) return null;
  const group: ShelfUserGroup = {
    id: newGroupId(),
    title: trimmed,
    sortOrder: store.groups.length,
    createdAt: Date.now(),
  };
  store.groups.push(group);
  writeStore(store);
  return group;
}

export function renameShelfUserGroup(groupId: string, title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  const store = readStore();
  const g = store.groups.find((x) => x.id === groupId);
  if (!g) return false;
  g.title = trimmed;
  writeStore(store);
  return true;
}

export function deleteShelfUserGroup(groupId: string): boolean {
  const store = readStore();
  const idx = store.groups.findIndex((x) => x.id === groupId);
  if (idx < 0) return false;
  store.groups.splice(idx, 1);
  for (const meta of Object.values(store.books)) {
    if (meta.groupId === groupId) meta.groupId = null;
  }
  writeStore(store);
  return true;
}

export function setShelfBookUserGroup(bookId: string, groupId: string | null) {
  const store = readStore();
  const meta = store.books[bookId] ?? {
    groupId: null,
    addedAt: Date.now(),
    lastReadAt: null,
  };
  meta.groupId = groupId;
  store.books[bookId] = meta;
  writeStore(store);
}

/** 将平台书目加入个人书柜视图（本地 meta，取消隐藏）。 */
export function pinShelfBookToLibrary(bookId: string) {
  const meta = ensureShelfBookMeta(bookId);
  meta.hidden = false;
  if (!meta.addedAt) meta.addedAt = Date.now();
  const store = readStore();
  store.books[bookId] = meta;
  writeStore(store);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('presto-shelf-library-changed'));
  }
}

export function hideShelfBook(bookId: string, hidden: boolean) {
  const store = readStore();
  const meta = ensureShelfBookMeta(bookId);
  meta.hidden = hidden;
  store.books[bookId] = meta;
  writeStore(store);
}

export function shelfBookProgressRatio(bookId: string): number | null {
  const progress = loadShelfBookProgress(bookId);
  if (!progress) return null;
  if (typeof progress.progressRatio === 'number') {
    return Math.min(1, Math.max(0, progress.progressRatio));
  }
  if (typeof progress.scrollOffset === 'number' && progress.scrollOffset > 0) {
    return Math.min(1, Math.max(0.04, progress.scrollOffset * 0.5 + 0.04));
  }
  if (typeof progress.pageIndex === 'number' && progress.pageIndex > 0) {
    return Math.min(1, (progress.pageIndex + 1) / Math.max(20, progress.pageIndex + 4));
  }
  return 0.04;
}

export function shelfBookReadStatus(bookId: string): ShelfProgressFilter {
  const progress = loadShelfBookProgress(bookId);
  const meta = readStore().books[bookId];
  if (!progress && !meta?.lastReadAt) return 'unread';
  if (progress?.finished || (progress?.progressRatio ?? 0) >= FINISH_RATIO) return 'finished';
  return 'reading';
}

export function filterAndSortShelfBooks(
  books: ShelfBookSummary[],
  tab: ShelfLibraryTab,
  query: string,
): ShelfBookSummary[] {
  syncShelfLibraryFromBooks(books);
  const store = readStore();
  const q = query.trim().toLowerCase();

  let list = books.filter((b) => {
    const meta = store.books[b.id];
    if (meta?.hidden) return false;
    if (q) {
      const hay = `${b.title} ${b.subtitle} ${b.author}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (tab.kind === 'group') {
      if (tab.groupId === SHELF_UNGROUPED_ID) {
        return !meta?.groupId;
      }
      return meta?.groupId === tab.groupId;
    }
    if (tab.kind === 'last_read') {
      return (meta?.lastReadAt ?? 0) > 0;
    }
    if (tab.kind === 'progress') {
      return shelfBookReadStatus(b.id) === tab.status;
    }
    return true;
  });

  if (tab.kind === 'last_read') {
    list = [...list].sort((a, b) => {
      const ma = store.books[a.id]?.lastReadAt ?? 0;
      const mb = store.books[b.id]?.lastReadAt ?? 0;
      if (mb !== ma) return mb - ma;
      return (store.books[b.id]?.addedAt ?? 0) - (store.books[a.id]?.addedAt ?? 0);
    });
  } else if (tab.kind === 'progress') {
    list = [...list].sort((a, b) => {
      const ma = store.books[a.id]?.lastReadAt ?? 0;
      const mb = store.books[b.id]?.lastReadAt ?? 0;
      if (mb !== ma) return mb - ma;
      return a.title.localeCompare(b.title, 'zh-CN');
    });
  } else if (tab.kind === 'added') {
    list = [...list].sort(
      (a, b) => (store.books[b.id]?.addedAt ?? 0) - (store.books[a.id]?.addedAt ?? 0),
    );
  } else {
    list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  }

  return list;
}

export function shelfUngroupedCount(books: ShelfBookSummary[]): number {
  const store = readStore();
  return books.filter((b) => !store.books[b.id]?.hidden && !store.books[b.id]?.groupId).length;
}

export function touchShelfBookLastRead(bookId: string, at = Date.now()) {
  const store = readStore();
  const meta = ensureShelfBookMeta(bookId);
  meta.lastReadAt = at;
  store.books[bookId] = meta;
  writeStore(store);
}

export function shelfBookReadHref(bookId: string): string {
  const progress = loadShelfBookProgress(bookId);
  if (!progress) return `/shelf/${encodeURIComponent(bookId)}/read`;
  const params = new URLSearchParams();
  params.set('section', progress.sectionId);
  if (typeof progress.pageIndex === 'number' && progress.pageIndex > 0) {
    params.set('page', String(progress.pageIndex));
  }
  const qs = params.toString();
  return `/shelf/${encodeURIComponent(bookId)}/read${qs ? `?${qs}` : ''}`;
}

export function shelfBookDetailHref(bookId: string): string {
  return `/shelf/${encodeURIComponent(bookId)}`;
}

/** 首次打开或已读完 → 详情；其余 → 阅读进度 */
export function shelfBookCardTarget(bookId: string): 'detail' | 'read' {
  const progress = loadShelfBookProgress(bookId);
  const meta = ensureShelfBookMeta(bookId);
  if (!progress && !meta.lastReadAt) return 'detail';
  if (progress?.finished || (progress?.progressRatio ?? 0) >= FINISH_RATIO) return 'detail';
  return 'read';
}

export function shelfBookCardHref(bookId: string): string {
  return shelfBookCardTarget(bookId) === 'detail'
    ? shelfBookDetailHref(bookId)
    : shelfBookReadHref(bookId);
}
