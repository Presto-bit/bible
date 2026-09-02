import { API_BASE } from './api_core';
import { adminHeaders, getAdminToken } from './admin_rag';

export type ShelfGroup = {
  id: string;
  title: string;
  sort_order?: number;
};

export type ShelfPlatformResponse = {
  groups: ShelfGroup[];
  items: import('./shelf_api').ShelfBookSummary[];
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...adminHeaders(),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `请求失败（${res.status}）`);
  }
  return (await res.json()) as T;
}

export function canManageShelf(): boolean {
  return !!getAdminToken();
}

export async function adminRenameShelfBook(bookId: string, title: string) {
  return adminFetch<{ ok: boolean }>(`/admin/shelf/books/${encodeURIComponent(bookId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: title.trim() }),
  });
}

export async function adminMoveShelfBook(bookId: string, groupId: string) {
  return adminFetch<{ ok: boolean }>(`/admin/shelf/books/${encodeURIComponent(bookId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ group_id: groupId }),
  });
}

export async function adminArchiveShelfBook(bookId: string) {
  return adminFetch<{ ok: boolean }>(`/admin/shelf/books/${encodeURIComponent(bookId)}`, {
    method: 'DELETE',
  });
}

export async function adminCreateShelfGroup(title: string) {
  const data = await adminFetch<{ group: ShelfGroup }>('/admin/shelf/groups', {
    method: 'POST',
    body: JSON.stringify({ title: title.trim() }),
  });
  return data.group;
}

export async function adminListShelfGroups() {
  const data = await adminFetch<{ groups: ShelfGroup[] }>('/admin/shelf/groups');
  return data.groups ?? [];
}
