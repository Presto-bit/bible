import { API_BASE } from './api';
import { getAdminToken } from './admin_rag';

export type ModerationCase = {
  id: string;
  reporter_id?: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  snapshot?: Record<string, unknown>;
};

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error('未登录管理后台');
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : '请求失败');
  }
  return res.json() as Promise<T>;
}

export async function fetchModerationCases(
  status: 'open' | 'actioned' | 'dismissed' | 'all' = 'open',
): Promise<ModerationCase[]> {
  const r = await adminJson<{ items: ModerationCase[] }>(
    `/admin/moderation/cases?status=${encodeURIComponent(status)}`,
  );
  return Array.isArray(r.items) ? r.items : [];
}

export async function resolveModerationCase(
  id: string,
  status: 'actioned' | 'dismissed' | 'open',
  note?: string,
): Promise<void> {
  await adminJson(`/admin/moderation/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  });
}
