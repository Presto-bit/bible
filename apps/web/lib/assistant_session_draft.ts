/** 小爱当前会话草稿：切换底部 Tab 后恢复，避免每次进入都像是新会话。 */

import type { Citation } from './api';
import { userLsGet, userLsSet, userLsRemove } from './user_storage';

const DRAFT_KEY = 'assistant_draft_v1';

export interface AssistantDraftMsg {
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  followups?: string[];
  scene?: string;
  sceneLabel?: string;
}

export interface AssistantDraft {
  activeId: string;
  msgs: AssistantDraftMsg[];
  ref: string;
  mode: string;
  updatedAt: number;
}

export function loadAssistantDraft(): AssistantDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = userLsGet(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssistantDraft;
    if (!parsed || !Array.isArray(parsed.msgs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAssistantDraft(draft: AssistantDraft) {
  if (typeof window === 'undefined') return;
  userLsSet(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }));
}

export function clearAssistantDraft() {
  if (typeof window === 'undefined') return;
  userLsRemove(DRAFT_KEY);
}
