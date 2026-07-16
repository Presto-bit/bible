import { API_BASE } from './api';

const ADMIN_TOKEN_KEY = 'bible_admin_token';

/** 管理员 token 写入/清除时派发，供保活 Tab 刷新管理员 UI */
export const ADMIN_SESSION_EVENT = 'bible-admin-session';

function notifyAdminSessionChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ADMIN_SESSION_EVENT));
}

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
  { id: 'mixed', label: '混合/上传' },
] as const;

export function ragSourceTypeLabel(id?: string | null): string {
  if (!id) return '未知';
  return RAG_SOURCE_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function adminHeaders(): HeadersInit {
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
  notifyAdminSessionChange();
}

export function clearAdminToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  notifyAdminSessionChange();
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
  uv_today: number;
  /** 今日未去重行数，用于区分「没写入」与「去重后为 0」 */
  uv_today_raw?: number;
  uv_today_guest: number;
  uv_today_login: number;
  /** 最近一次 UV 写入错误（无则 null） */
  uv_write_error?: string | null;
  uv_login_visits: number;
  uv_converted_today: number;
  uv_7d: number;
};

export type AdminStatsDod = {
  today: number;
  yesterday: number;
  pct: number | null;
};

export type AdminStatsSeriesPoint = { date: string; count: number };

export type AdminStatsSeriesKey =
  | 'users'
  | 'groups'
  | 'group_members'
  | 'friendships'
  | 'messages'
  | 'checkins'
  | 'ai_requests'
  | 'rag_documents'
  | 'uv';

export type AdminStats = {
  totals: AdminStatsTotals;
  series: Record<AdminStatsSeriesKey, AdminStatsSeriesPoint[]>;
  dod: Record<string, AdminStatsDod>;
};

export type AdminStatsRangePreset = 'today' | '7d' | '30d' | 'custom';

export type AdminStatsInsight = {
  label: string;
  value: string | number;
  hint?: string;
};

export type AdminStatsColumn = { key: string; label: string };

export type AdminStatsSection = {
  key: string;
  title: string;
  columns: AdminStatsColumn[];
  items: Record<string, string | number | boolean | null>[];
};

export type AdminStatsRange = {
  from: string;
  to: string;
  preset: string;
};

export async function fetchAdminStats(seriesDays = 7): Promise<AdminStats> {
  const res = await fetch(`${API_BASE}/admin/stats?days=${seriesDays}`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await readApiError(res, '加载统计失败'));
  return (await res.json()) as AdminStats;
}

export type AdminStatsDetail = {
  metric: AdminStatsSeriesKey;
  title: string;
  summary: string;
  range: AdminStatsRange | null;
  series: AdminStatsSeriesPoint[];
  insights: AdminStatsInsight[];
  sections: AdminStatsSection[];
  items: Record<string, string | number | boolean | null>[];
};

export async function fetchAdminStatsDetail(
  metric: AdminStatsSeriesKey,
  opts: {
    limit?: number;
    preset?: AdminStatsRangePreset;
    days?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {},
): Promise<AdminStatsDetail> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.preset) params.set('preset', opts.preset);
  if (opts.days) params.set('days', String(opts.days));
  if (opts.dateFrom) params.set('date_from', opts.dateFrom);
  if (opts.dateTo) params.set('date_to', opts.dateTo);
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE}/admin/stats/detail/${encodeURIComponent(metric)}${qs ? `?${qs}` : ''}`,
    {
      headers: adminHeaders(),
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(await readApiError(res, '加载明细失败'));
  return (await res.json()) as AdminStatsDetail;
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

export type RagEnsureStep = {
  step?: string;
  script?: string;
  ok?: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
  skipped?: string;
  file_count?: number;
  dir?: string;
  source_type?: string;
};

export async function importRagSources(
  skipRemote = false,
): Promise<{ ok: boolean; steps: RagEnsureStep[] }> {
  const res = await fetch(`${API_BASE}/admin/rag/import-sources`, {
    method: 'POST',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ skip_remote: skipRemote }),
  });
  if (!res.ok) throw new Error(await readApiError(res, '拉取注释失败'));
  return (await res.json()) as { ok: boolean; steps: RagEnsureStep[] };
}

export type RagIndexJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export type RagIndexJob = {
  id: string;
  kind: string;
  status: RagIndexJobStatus;
  payload?: Record<string, unknown>;
  progress: Record<string, unknown>;
  error?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export async function fetchRagJob(jobId: string): Promise<RagIndexJob> {
  const res = await fetch(`${API_BASE}/admin/rag/jobs/${encodeURIComponent(jobId)}`, {
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(await readApiError(res, '查询索引任务失败'));
  return (await res.json()) as RagIndexJob;
}

export async function listRagJobs(limit = 20): Promise<RagIndexJob[]> {
  const res = await fetch(`${API_BASE}/admin/rag/jobs?limit=${limit}`, {
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(await readApiError(res, '任务列表失败'));
  const data = (await res.json()) as { items?: RagIndexJob[] };
  return data.items ?? [];
}

export async function waitForRagJob(
  jobId: string,
  opts?: {
    onUpdate?: (job: RagIndexJob) => void;
    intervalMs?: number;
    timeoutMs?: number;
  },
): Promise<RagIndexJob> {
  const intervalMs = opts?.intervalMs ?? 1200;
  const timeoutMs = opts?.timeoutMs ?? 45 * 60 * 1000;
  const t0 = Date.now();
  for (;;) {
    const job = await fetchRagJob(jobId);
    opts?.onUpdate?.(job);
    if (job.status === 'done') return job;
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.error || `索引任务${job.status === 'cancelled' ? '已取消' : '失败'}`);
    }
    if (Date.now() - t0 > timeoutMs) {
      throw new Error('索引任务超时，请稍后刷新资料清单查看');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function enqueueIndexJob(
  path: string,
  body: Record<string, unknown>,
  errLabel: string,
  onUpdate?: (job: RagIndexJob) => void,
): Promise<RagIndexJob> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res, errLabel));
  const data = (await res.json()) as { ok?: boolean; queued?: boolean; job?: RagIndexJob } & Record<
    string,
    unknown
  >;
  if (data.queued && data.job?.id) {
    return waitForRagJob(data.job.id, { onUpdate });
  }
  return {
    id: '',
    kind: 'legacy',
    status: 'done',
    progress: data,
  };
}

export async function indexRagCollections(
  force = false,
  onUpdate?: (job: RagIndexJob) => void,
): Promise<{ ok: boolean; indexed_groups: number; steps: RagEnsureStep[] }> {
  const job = await enqueueIndexJob(
    '/admin/rag/index-collections',
    { force },
    '批量索引失败',
    onUpdate,
  );
  const p = job.progress || {};
  return {
    ok: p.ok !== false,
    indexed_groups: Number(p.indexed_groups ?? 0),
    steps: Array.isArray(p.steps) ? (p.steps as RagEnsureStep[]) : [],
  };
}

export async function indexPendingDisk(
  collectionId?: string,
  limit = 8,
  onUpdate?: (job: RagIndexJob) => void,
): Promise<{
  pending: number;
  processed: number;
  has_more: boolean;
  remaining: number;
  stale_reset: number;
  indexed: number;
  skipped: number;
  failed: number;
}> {
  const job = await enqueueIndexJob(
    '/admin/rag/index-pending-disk',
    {
      force: true,
      collection_id: collectionId ?? null,
      limit,
    },
    '批量向量化失败',
    onUpdate,
  );
  const p = job.progress || {};
  return {
    pending: Number(p.pending ?? 0),
    processed: Number(p.processed ?? 0),
    has_more: p.has_more === true,
    remaining: Number(p.remaining ?? 0),
    stale_reset: Number(p.stale_reset ?? 0),
    indexed: Number(p.indexed ?? 0),
    skipped: Number(p.skipped ?? 0),
    failed: Number(p.failed ?? 0),
  };
}

export async function indexPendingUploads(
  sourceType = 'commentary',
  onUpdate?: (job: RagIndexJob) => void,
): Promise<{ pending: number; indexed: number; skipped: number; failed: number }> {
  const job = await enqueueIndexJob(
    '/admin/rag/uploads/index-pending',
    { source_type: sourceType, force: true },
    '批量向量化失败',
    onUpdate,
  );
  const p = job.progress || {};
  return {
    pending: Number(p.pending ?? 0),
    indexed: Number(p.indexed ?? 0),
    skipped: Number(p.skipped ?? 0),
    failed: Number(p.failed ?? 0),
  };
}

export async function indexUploadFile(
  filename: string,
  opts?: { title?: string; sourceType?: string; onUpdate?: (job: RagIndexJob) => void },
): Promise<{ ok: boolean; queued?: boolean; message?: string }> {
  await enqueueIndexJob(
    `/admin/rag/uploads/${encodeURIComponent(filename)}/index`,
    {
      title: opts?.title,
      source_type: opts?.sourceType ?? 'commentary',
      force: true,
    },
    '向量化失败',
    opts?.onUpdate,
  );
  return { ok: true, queued: true, message: '向量化完成' };
}

export async function deleteRagDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/rag/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(await readApiError(res, '删除失败'));
}

export async function purgeRagOrphans(): Promise<{ ok: boolean; deleted: number; ids: string[] }> {
  const res = await fetch(`${API_BASE}/admin/rag/orphans/purge`, {
    method: 'POST',
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error(await readApiError(res, '清除孤儿文档失败'));
  return (await res.json()) as { ok: boolean; deleted: number; ids: string[] };
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

export async function renameRagDocument(id: string, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/rag/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim() }),
  });
  if (!res.ok) throw new Error(await readApiError(res, '改名失败'));
}

/* ── RAG 工作台（PC）── */

export type RagWorkspaceNode = {
  type: 'file' | 'folder';
  name: string;
  path: string;
  inventory_status?: RagInventoryStatus;
  inventory_label?: string;
  document_id?: string | null;
  title?: string;
  chunks?: number;
  size_bytes?: number;
  rag_index_error?: string | null;
  writable?: boolean;
  children?: RagWorkspaceNode[];
};

export type RagWorkspaceCollection = {
  id: string;
  label: string;
  source_type: string;
  dir: string;
  dir_exists: boolean;
  writable: boolean;
  file_count: number;
  counts: Record<string, number>;
  children: RagWorkspaceNode[];
};

export type RagWorkspaceTree = {
  summary: RagInventory['summary'];
  orphans: RagDocument[];
  collections: RagWorkspaceCollection[];
  commentary_root?: string;
};

export type RagWorkspaceFile = {
  collection_id: string;
  path: string;
  filename: string;
  writable: boolean;
  source_type?: string;
  size_bytes: number;
  mtime: string;
  content: string;
  content_stale: boolean;
  inventory_status: RagInventoryStatus;
  inventory_label: string;
  document_id?: string | null;
  title: string;
  chunks: number;
  rag_index_at?: string | null;
  rag_index_error?: string | null;
  db_status?: string | null;
};

export type RagWorkspaceChunk = {
  index: number;
  preview: string;
  length: number;
};

async function workspaceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...adminHeaders(),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await readApiError(res, '操作失败'));
  return (await res.json()) as T;
}

export function fetchRagWorkspaceTree(): Promise<RagWorkspaceTree> {
  return workspaceJson('/admin/rag/workspace/tree');
}

export function fetchRagWorkspaceFile(collectionId: string, path: string): Promise<RagWorkspaceFile> {
  const q = new URLSearchParams({ collection_id: collectionId, path });
  return workspaceJson(`/admin/rag/workspace/file?${q}`);
}

export function saveRagWorkspaceFile(
  collectionId: string,
  path: string,
  content: string,
): Promise<RagWorkspaceFile> {
  return workspaceJson('/admin/rag/workspace/file', {
    method: 'PUT',
    body: JSON.stringify({ collection_id: collectionId, path, content }),
  });
}

export function mkdirRagWorkspace(collectionId: string, path: string): Promise<{ ok: boolean; path: string }> {
  return workspaceJson('/admin/rag/workspace/mkdir', {
    method: 'POST',
    body: JSON.stringify({ collection_id: collectionId, path }),
  });
}

export function createRagWorkspaceFile(
  collectionId: string,
  path: string,
  content?: string,
): Promise<RagWorkspaceFile> {
  return workspaceJson('/admin/rag/workspace/create-file', {
    method: 'POST',
    body: JSON.stringify({ collection_id: collectionId, path, content: content ?? null }),
  });
}

export function moveRagWorkspace(opts: {
  collectionId: string;
  fromPath: string;
  toPath: string;
  toCollectionId?: string;
}): Promise<{ ok: boolean; collection_id: string; path: string }> {
  return workspaceJson('/admin/rag/workspace/move', {
    method: 'POST',
    body: JSON.stringify({
      collection_id: opts.collectionId,
      from_path: opts.fromPath,
      to_path: opts.toPath,
      to_collection_id: opts.toCollectionId ?? null,
    }),
  });
}

export function deleteRagWorkspace(
  collectionId: string,
  path: string,
  purgeDb = true,
): Promise<{ ok: boolean }> {
  return workspaceJson('/admin/rag/workspace/delete', {
    method: 'POST',
    body: JSON.stringify({ collection_id: collectionId, path, purge_db: purgeDb }),
  });
}

export async function indexRagWorkspaceFile(
  collectionId: string,
  path: string,
  force = true,
  onUpdate?: (job: RagIndexJob) => void,
): Promise<{ ok: boolean; file: RagWorkspaceFile; index?: RagIndexResult }> {
  await enqueueIndexJob(
    '/admin/rag/workspace/index',
    { collection_id: collectionId, path, force },
    '索引失败',
    onUpdate,
  );
  const file = await fetchRagWorkspaceFile(collectionId, path);
  return { ok: true, file };
}

export function fetchRagWorkspaceChunks(
  documentId: string,
  limit = 50,
): Promise<{ document_id: string; title: string; total: number; chunks: RagWorkspaceChunk[] }> {
  const q = new URLSearchParams({ document_id: documentId, limit: String(limit) });
  return workspaceJson(`/admin/rag/workspace/chunks?${q}`);
}

