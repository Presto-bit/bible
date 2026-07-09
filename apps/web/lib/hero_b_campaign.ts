/** 首页 Hero B 活动类型与缓存 */

import { contentAssetUrl } from './api';
import { getAdminToken } from './admin_rag';

export type HeroBLink = {
  kind: string;
  params?: Record<string, string | number>;
};

export type HeroBCampaign = {
  id: string;
  imageUrl: string;
  imageUrlDark?: string | null;
  alt: string;
  href: string;
  badge?: string | null;
};

export type HeroBCampaignAdmin = HeroBCampaign & {
  name: string;
  enabled: boolean;
  status: 'draft' | 'published';
  priority: number;
  startAt: string;
  endAt: string;
  imageVersion: number;
  link: HeroBLink;
  audience: 'all' | 'admin_preview';
  createdAt?: string | null;
  updatedAt?: string | null;
};

const CACHE_KEY = 'presto_hero_b_campaign_v1';

export function heroBCampaignImageSrc(campaign: HeroBCampaign): string {
  const url = campaign.imageUrl.startsWith('http')
    ? campaign.imageUrl
    : contentAssetUrl(campaign.imageUrl);
  return url;
}

export function readCachedHeroBCampaign(): HeroBCampaign | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HeroBCampaign;
  } catch {
    return null;
  }
}

export function writeCachedHeroBCampaign(campaign: HeroBCampaign | null) {
  if (typeof window === 'undefined') return;
  if (!campaign) {
    localStorage.removeItem(CACHE_KEY);
    return;
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(campaign));
}

export function homeBootstrapHeaders(): HeadersInit {
  const token = getAdminToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function preloadHeroBCampaignImage(campaign: HeroBCampaign): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = heroBCampaignImageSrc(campaign);
  });
}
