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

function apiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const detail = (data as { detail?: unknown; error?: unknown }).detail
    ?? (data as { error?: unknown }).error;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('；');
  }
  return fallback;
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return `${fallback}（HTTP ${res.status}）`;
  try {
    return apiErrorMessage(JSON.parse(text), `${fallback}（HTTP ${res.status}）`);
  } catch {
    if (res.status === 404) {
      return '管理员接口不可达（请确认 Nginx 已反代 /admin 到 API）';
    }
    return `${fallback}（HTTP ${res.status}）`;
  }
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
  const text = await res.text().catch(() => '');
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? '管理员接口不可达（请确认 Nginx 已反代 /admin 到 API）'
          : `登录失败（HTTP ${res.status}）`,
      );
    }
    throw new Error('登录响应异常');
  }
  if (!res.ok) throw new Error(apiErrorMessage(data, '登录失败'));
  if (typeof data.token !== 'string' || !data.token) {
    throw new Error('登录响应缺少令牌');
  }
  setAdminToken(data.token);
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
  if (!res.ok) throw new Error(await readApiError(res, '加载状态失败'));
  return (await res.json()) as RagStatus;
}

export async function fetchRagDocuments(): Promise<RagDocument[]> {
  const res = await fetch(`${API_BASE}/admin/rag/documents`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await readApiError(res, '加载资料失败'));
  const data = (await res.json()) as { documents?: RagDocument[] };
  return data.documents ?? [];
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
  if (!res.ok) throw new Error(await readApiError(res, '上传失败'));
}

export async function deleteRagDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/rag/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(await readApiError(res, '删除失败'));
}

export async function reindexRagDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/rag/documents/${encodeURIComponent(id)}/reindex`, {
    method: 'POST',
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(await readApiError(res, '重建索引失败'));
}
