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
  inventory_status?: RagInventoryStatus;
  inventory_label?: string;
};

export type RagInventoryStatus = 'indexed' | 'pending' | 'failed' | 'indexing' | 'orphan';

export type RagInventoryDoc = {
  file: string;
  filename: string;
  subgroup?: string | null;
  size_bytes?: number;
  inventory_status: RagInventoryStatus;
  inventory_label: string;
  document_id?: string | null;
  title: string;
  chunks: number;
  source_type?: string;
  rag_index_at?: string | null;
  rag_index_error?: string | null;
  db_status?: string | null;
};

export type RagImportMeta = {
  file: string;
  id: string;
  title: string;
  language?: string | null;
  books_total?: number | null;
  books_done?: number | null;
  chapters_expected?: number | null;
};

export type RagInventoryCollection = {
  id: string;
  label: string;
  source_type: string;
  dir: string;
  dir_exists: boolean;
  file_count: number;
  counts: Record<RagInventoryStatus, number>;
  import_meta: RagImportMeta[];
  documents: RagInventoryDoc[];
};

export type RagInventory = {
  commentary_root: string;
  commentary_root_exists: boolean;
  summary: {
    indexed: number;
    pending: number;
    failed: number;
    indexing: number;
    orphan: number;
    files_on_disk: number;
    db_documents: number;
    db_chunks: number;
  };
  collections: RagInventoryCollection[];
  orphans: RagDocument[];
  db_error?: string | null;
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

export type RagIndexResult = {
  title?: string;
  chunks?: number;
  reused?: number;
  skipped?: boolean;
  reason?: string;
  backend?: string;
  error?: string;
};

export type RagUploadResult = {
  ok: boolean;
  filename?: string;
  message?: string;
  index?: RagIndexResult;
  document?: RagDocument | null;
};

export type RagPendingUpload = {
  filename: string;
  path: string;
  size_bytes: number;
  inventory_status: RagInventoryStatus;
  document_id?: string | null;
  title: string;
};

export const RAG_SOURCE_TYPES = [
  { id: 'commentary', label: '英文注释' },
  { id: 'commentary-zh', label: '中文注释' },
  { id: 'study-bible', label: '研经资料' },
  { id: 'study-bible-zh', label: '中文自有资料' },
  { id: 'reference-en', label: '英文参考词典' },
] as const;

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

export async function fetchAdminEligible(): Promise<boolean> {
  try {
    const { authHeaders } = await import('./api');
    const res = await fetch(`${API_BASE}/admin/auth/eligible`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { admin_eligible?: boolean };
    return data.admin_eligible === true;
  } catch {
    return false;
  }
}

export type AdminStatsTotals = {
  users: number;
  accounts: number;
  groups: number;
  group_members: number;
  friendships: number;
  messages_today: number;
  checkins_today: number;
  rag_documents: number;
  rag_chunks: number;
  rag_failed: number;
  ai_requests_today: number;
  ai_requests_7d: number;
};

export type AdminStatsSeriesPoint = { date: string; count: number };

export type AdminStats = {
  totals: AdminStatsTotals;
  series: {
    ai_requests: AdminStatsSeriesPoint[];
    checkins: AdminStatsSeriesPoint[];
  };
};

export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await fetch(`${API_BASE}/admin/stats`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await readApiError(res, '加载统计失败'));
  return (await res.json()) as AdminStats;
}

export async function fetchRagStatus(): Promise<RagStatus> {
  const res = await fetch(`${API_BASE}/admin/rag/status`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await readApiError(res, '加载状态失败'));
  return (await res.json()) as RagStatus;
}

export async function fetchRagInventory(): Promise<RagInventory> {
  const res = await fetch(`${API_BASE}/admin/rag/inventory`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await readApiError(res, '加载资料清单失败'));
  return (await res.json()) as RagInventory;
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

export async function fetchPendingUploads(): Promise<RagPendingUpload[]> {
  const res = await fetch(`${API_BASE}/admin/rag/uploads/pending`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await readApiError(res, '加载待向量化列表失败'));
  const data = (await res.json()) as { pending?: RagPendingUpload[] };
  return data.pending ?? [];
}

export async function uploadRagDocument(
  file: File,
  title: string,
  sourceType: string,
  bookId?: string,
): Promise<RagUploadResult> {
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
  return (await res.json()) as RagUploadResult;
}

export async function indexPendingUploads(
  sourceType = 'commentary',
): Promise<{ pending: number; indexed: number; skipped: number; failed: number }> {
  const res = await fetch(`${API_BASE}/admin/rag/uploads/index-pending`, {
    method: 'POST',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_type: sourceType, force: true }),
  });
  if (!res.ok) throw new Error(await readApiError(res, '批量向量化失败'));
  const data = (await res.json()) as {
    pending?: number;
    indexed?: number;
    skipped?: number;
    failed?: number;
  };
  return {
    pending: data.pending ?? 0,
    indexed: data.indexed ?? 0,
    skipped: data.skipped ?? 0,
    failed: data.failed ?? 0,
  };
}

export async function indexUploadFile(
  filename: string,
  opts?: { title?: string; sourceType?: string },
): Promise<RagUploadResult> {
  const res = await fetch(
    `${API_BASE}/admin/rag/uploads/${encodeURIComponent(filename)}/index`,
    {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: opts?.title,
        source_type: opts?.sourceType ?? 'commentary',
        force: true,
      }),
    },
  );
  if (!res.ok) throw new Error(await readApiError(res, '向量化失败'));
  return (await res.json()) as RagUploadResult;
}

export async function deleteRagDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/rag/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(await readApiError(res, '删除失败'));
}

export async function reindexRagDocument(id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/admin/rag/documents/${encodeURIComponent(id)}/reindex`, {
    method: 'POST',
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(await readApiError(res, '重建索引失败'));
  const data = (await res.json()) as { message?: string };
  return data.message ?? '重建索引完成';
}
