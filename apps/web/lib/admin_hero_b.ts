import { API_BASE } from './api';
import { getAdminToken, adminHeaders } from './admin_rag';
import type { HeroBCampaignAdmin, HeroBLink } from './hero_b_campaign';

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...adminHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`响应异常（HTTP ${res.status}）`);
  }
  if (!res.ok) {
    const detail = (data as { detail?: string }).detail;
    throw new Error(detail || `请求失败（HTTP ${res.status}）`);
  }
  return data as T;
}

export async function fetchAdminHeroCampaigns(): Promise<HeroBCampaignAdmin[]> {
  const data = await adminFetch<{ campaigns: HeroBCampaignAdmin[] }>('/admin/ops/hero-b');
  return data.campaigns ?? [];
}

export async function saveAdminHeroCampaign(
  body: Partial<HeroBCampaignAdmin> & { id: string; name: string; link: HeroBLink },
  isNew: boolean,
): Promise<HeroBCampaignAdmin> {
  const path = isNew ? '/admin/ops/hero-b' : `/admin/ops/hero-b/${encodeURIComponent(body.id)}`;
  const data = await adminFetch<{ campaign: HeroBCampaignAdmin }>(path, {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.campaign;
}

export async function deleteAdminHeroCampaign(id: string): Promise<void> {
  await adminFetch(`/admin/ops/hero-b/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function uploadAdminHeroImage(file: File, campaignId?: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  if (campaignId) form.append('campaign_id', campaignId);
  const data = await adminFetch<{ imageUrl: string }>('/admin/ops/hero-b/upload', {
    method: 'POST',
    body: form,
  });
  return data.imageUrl;
}

export async function resolveAdminHeroLink(link: HeroBLink): Promise<string> {
  const data = await adminFetch<{ href: string }>('/admin/ops/hero-b/resolve-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link }),
  });
  return data.href;
}

export function adminHeroPreviewHint(campaignId: string): string {
  return `${API_BASE}/content/home/bootstrap?preview_campaign_id=${encodeURIComponent(campaignId)}`;
}

export function hasAdminToken(): boolean {
  return !!getAdminToken();
}
