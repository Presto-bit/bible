import { API_BASE, authHeaders } from './api_core';
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

/** 全站 Admin 令牌，或登录用户属于书柜管理员名单。 */
export async function fetchShelfAdminCapabilities(): Promise<{
  shelf_admin: boolean;
  can_append_collection: boolean;
}> {
  if (getAdminToken()) {
    return { shelf_admin: true, can_append_collection: true };
  }
  try {
    const res = await fetch(`${API_BASE}/shelf/platform/capabilities`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return { shelf_admin: false, can_append_collection: false };
    const data = (await res.json()) as {
      shelf_admin?: boolean;
      can_append_collection?: boolean;
    };
    return {
      shelf_admin: Boolean(data.shelf_admin),
      can_append_collection: Boolean(data.can_append_collection ?? data.shelf_admin),
    };
  } catch {
    return { shelf_admin: false, can_append_collection: false };
  }
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

function shelfManageHeaders(): Record<string, string> {
  const headers: Record<string, string> = { ...authHeaders() };
  try {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }
  return headers;
}

export async function adminListCollectionUnits(bookId: string): Promise<string[]> {
  const res = await fetch(
    `${API_BASE}/admin/shelf/collections/${encodeURIComponent(bookId)}/units`,
    { headers: shelfManageHeaders(), cache: 'no-store' },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `请求失败（${res.status}）`);
  }
  const data = (await res.json()) as { units?: string[] };
  return data.units ?? [];
}

export async function adminAppendCollectionLesson(
  bookId: string,
  file: File,
  opts?: { title?: string; unit?: string; zone?: string },
): Promise<{ ok: boolean; section?: { id: string; title: string } }> {
  const form = new FormData();
  form.append('file', file);
  if (opts?.title?.trim()) form.append('title', opts.title.trim());
  if (opts?.unit?.trim()) form.append('unit', opts.unit.trim());
  if (opts?.zone?.trim()) form.append('zone', opts.zone.trim());
  const res = await fetch(
    `${API_BASE}/admin/shelf/collections/${encodeURIComponent(bookId)}/lessons`,
    { method: 'POST', headers: shelfManageHeaders(), body: form, cache: 'no-store' },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `上传失败（${res.status}）`);
  }
  return (await res.json()) as { ok: boolean; section?: { id: string; title: string } };
}
