/** 活动编辑草稿本地自动保存 */

import type { OpsCampaignLanding } from '@/lib/api';

const PREFIX = 'ops_campaign_draft_v1:';

export type CampaignDraftPayload = {
  name: string;
  subtitle: string;
  status: string;
  groupIds: string[];
  audienceMode?: 'groups' | 'all' | 'admin_preview';
  railSlot: number;
  railEnabled: boolean;
  startAt: string;
  endAt: string;
  landing: OpsCampaignLanding;
  savedAt: string;
};

export function draftKey(campaignId: string): string {
  return `${PREFIX}${campaignId}`;
}

export function loadCampaignDraft(campaignId: string): CampaignDraftPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(draftKey(campaignId));
    if (!raw) return null;
    return JSON.parse(raw) as CampaignDraftPayload;
  } catch {
    return null;
  }
}

export function saveCampaignDraft(campaignId: string, payload: Omit<CampaignDraftPayload, 'savedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const data: CampaignDraftPayload = { ...payload, savedAt: new Date().toISOString() };
    localStorage.setItem(draftKey(campaignId), JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function clearCampaignDraft(campaignId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(draftKey(campaignId));
  } catch {
    /* ignore */
  }
}
