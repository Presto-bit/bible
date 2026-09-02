/** 书架 API 内存/本地缓存，减少重复请求与首屏等待。 */

import type { ShelfBookDetail, ShelfGroup, ShelfBookSummary, ShelfSection } from './shelf_api';
import { getJson } from './api_core';

const LIST_KEY = 'shelf_platform_list_v1';
const LIST_TTL_MS = 30 * 60 * 1000;

type ListPayload = { groups: ShelfGroup[]; items: ShelfBookSummary[]; savedAt: number };

let listInflight: Promise<ListPayload> | null = null;
const bookInflight = new Map<string, Promise<ShelfBookDetail>>();
const sectionInflight = new Map<string, Promise<ShelfSection>>();
const bookMem = new Map<string, ShelfBookDetail>();
const sectionMem = new Map<string, ShelfSection>();

function sectionKey(bookId: string, sectionId: string) {
  return `${bookId}:${sectionId}`;
}

function readListStorage(): ListPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListPayload;
    if (!parsed?.items || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeListStorage(data: ListPayload) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function peekShelfListCache(allowStale = true): ListPayload | null {
  const stored = readListStorage();
  if (!stored) return null;
  const fresh = Date.now() - (stored.savedAt || 0) < LIST_TTL_MS;
  if (fresh || allowStale) return stored;
  return null;
}

export function peekShelfSectionCache(bookId: string, sectionId: string): ShelfSection | null {
  return sectionMem.get(sectionKey(bookId, sectionId)) ?? null;
}

export async function fetchShelfList(force = false): Promise<ListPayload> {
  const cached = peekShelfListCache(true);
  if (cached && !force) {
    void refreshShelfListInBackground();
    return cached;
  }
  return fetchShelfListFresh(force);
}

export function refreshShelfListInBackground(): void {
  if (listInflight) return;
  void fetchShelfListFresh(true).catch(() => {});
}

async function fetchShelfListFresh(force = false): Promise<ListPayload> {
  if (listInflight && !force) return listInflight;
  listInflight = getJson<{ groups: ShelfGroup[]; items: ShelfBookSummary[] }>('/shelf/platform')
    .then((data) => {
      const payload: ListPayload = {
        groups: data.groups ?? [],
        items: data.items ?? [],
        savedAt: Date.now(),
      };
      writeListStorage(payload);
      return payload;
    })
    .finally(() => {
      listInflight = null;
    });
  return listInflight;
}

export async function fetchShelfBook(bookId: string, force = false): Promise<ShelfBookDetail> {
  if (!force) {
    const hit = bookMem.get(bookId);
    if (hit) return hit;
    const inflight = bookInflight.get(bookId);
    if (inflight) return inflight;
  }
  const p = getJson<ShelfBookDetail>(`/shelf/platform/${encodeURIComponent(bookId)}`).then((detail) => {
    bookMem.set(bookId, detail);
    return detail;
  }).finally(() => {
    bookInflight.delete(bookId);
  });
  bookInflight.set(bookId, p);
  return p;
}

export async function fetchShelfSection(
  bookId: string,
  sectionId: string,
  force = false,
): Promise<ShelfSection> {
  const key = sectionKey(bookId, sectionId);
  if (!force) {
    const hit = sectionMem.get(key);
    if (hit) return hit;
    const inflight = sectionInflight.get(key);
    if (inflight) return inflight;
  }
  const p = getJson<ShelfSection>(
    `/shelf/platform/${encodeURIComponent(bookId)}/sections/${encodeURIComponent(sectionId)}`,
  ).then((section) => {
    sectionMem.set(key, section);
    return section;
  }).finally(() => {
    sectionInflight.delete(key);
  });
  sectionInflight.set(key, p);
  return p;
}

export function prefetchShelfSection(bookId: string, sectionId: string | null | undefined) {
  if (!sectionId) return;
  if (sectionMem.has(sectionKey(bookId, sectionId))) return;
  const run = () => {
    void fetchShelfSection(bookId, sectionId).catch(() => {});
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 1200 });
  } else {
    window.setTimeout(run, 120);
  }
}

export function invalidateShelfListCache() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(LIST_KEY);
    } catch {
      /* ignore */
    }
  }
}
