import { API_BASE } from './api';

const ADMIN_TOKEN_KEY = 'bible_admin_token';

export type RagDocument = {
  id: string;
  title: string;
  source_type: string;
  status: string;
  source_path?: string | null;
  rag_index_at?: string | null;
  created_at?: string | null;
  rag_index_error?: string | null;
  chunks: number;
};

export type RagStatus = {
  llm_configured: boolean;
  embedding_configured: boolean;
  db_ok: boolean;
  documents: number;
  chunks: number;
  rag_ready: boolean;
  error?: string;
  documents_detail?: RagDocument[];
};

function adminHeaders(): HeadersInit {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) throw new Error('未登录管理员');
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function adminLogin(phone: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || '登录失败');
  setAdminToken(data.token as string);
}

export async function adminCheck(): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      clearAdminToken();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchRagStatus(): Promise<RagStatus> {
  const res = await fetch(`${API_BASE}/admin/rag/status`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || '加载状态失败');
  return data as RagStatus;
}

export async function fetchRagDocuments(): Promise<RagDocument[]> {
  const res = await fetch(`${API_BASE}/admin/rag/documents`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || '加载资料失败');
  return (data.documents ?? []) as RagDocument[];
}

export async function uploadRagDocument(
  file: File,
  title: string,
  sourceType: string,
  bookId?: string,
): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  form.append('title', title);
  form.append('source_type', sourceType);
  if (bookId?.trim()) form.append('book_id', bookId.trim().toUpperCase());

  const res = await fetch(`${API_BASE}/admin/rag/documents`, {
    method: 'POST',
    headers: adminHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || '上传失败');
}

export async function deleteRagDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/rag/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || '删除失败');
}

export async function reindexRagDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/rag/documents/${encodeURIComponent(id)}/reindex`, {
    method: 'POST',
    headers: adminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || '重建索引失败');
}
