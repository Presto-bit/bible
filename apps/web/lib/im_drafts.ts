/** 会话级草稿（群 / 私信），本地持久；支持结构化 mentions / 回复。 */

import { userLsGet, userLsSet, userLsRemove } from './user_storage';

const KEY = 'im_drafts_v2';
const LEGACY_KEY = 'im_drafts_v1';

export type ImDraftMention = { id: string; label: string };

export type ImDraft = {
  text: string;
  mentions?: ImDraftMention[];
  mentionAll?: boolean;
  replyToId?: string;
  replyAuthor?: string;
  replySnippet?: string;
};

type DraftMap = Record<string, ImDraft | string>;

function normalize(raw: unknown): ImDraft | null {
  if (typeof raw === 'string') {
    return raw ? { text: raw.slice(0, 2000) } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text.slice(0, 2000) : '';
  const mentions = Array.isArray(o.mentions)
    ? (o.mentions as ImDraftMention[])
        .filter((m) => m && typeof m.id === 'string' && typeof m.label === 'string')
        .slice(0, 20)
    : undefined;
  const draft: ImDraft = { text };
  if (mentions?.length) draft.mentions = mentions;
  if (o.mentionAll === true) draft.mentionAll = true;
  if (typeof o.replyToId === 'string' && o.replyToId) {
    draft.replyToId = o.replyToId;
    if (typeof o.replyAuthor === 'string') draft.replyAuthor = o.replyAuthor;
    if (typeof o.replySnippet === 'string') draft.replySnippet = o.replySnippet;
  }
  return draft;
}

function isEmpty(d: ImDraft): boolean {
  return (
    !d.text.trim()
    && !d.mentionAll
    && !(d.mentions && d.mentions.length)
    && !d.replyToId
  );
}

function load(): DraftMap {
  try {
    const raw = userLsGet(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DraftMap;
      if (parsed && typeof parsed === 'object') return parsed;
    }
    // 迁移 v1 纯字符串草稿
    const legacy = userLsGet(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Record<string, string>;
      if (parsed && typeof parsed === 'object') {
        const next: DraftMap = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.trim()) next[k] = { text: v.slice(0, 2000) };
        }
        save(next);
        userLsRemove(LEGACY_KEY);
        return next;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

function save(map: DraftMap) {
  userLsSet(KEY, JSON.stringify(map));
}

export function draftKey(scope: 'group' | 'dm', refId: string): string {
  return `${scope}:${refId}`;
}

/** 结构化草稿 */
export function getImDraftRecord(scope: 'group' | 'dm', refId: string): ImDraft {
  const raw = load()[draftKey(scope, refId)];
  return normalize(raw) || { text: '' };
}

/** 仅正文（兼容旧调用） */
export function getImDraft(scope: 'group' | 'dm', refId: string): string {
  return getImDraftRecord(scope, refId).text;
}

export function setImDraftRecord(scope: 'group' | 'dm', refId: string, draft: ImDraft) {
  const map = load();
  const key = draftKey(scope, refId);
  const next = normalize(draft) || { text: '' };
  if (isEmpty(next)) {
    delete map[key];
  } else {
    map[key] = next;
  }
  save(map);
  if (!Object.keys(map).length) userLsRemove(KEY);
}

/** 仅写正文（兼容）；会保留已有 mentions/reply，除非正文被清空且无其他字段 */
export function setImDraft(scope: 'group' | 'dm', refId: string, text: string) {
  const prev = getImDraftRecord(scope, refId);
  setImDraftRecord(scope, refId, { ...prev, text });
}

export function clearImDraft(scope: 'group' | 'dm', refId: string) {
  const map = load();
  delete map[draftKey(scope, refId)];
  save(map);
  if (!Object.keys(map).length) userLsRemove(KEY);
}
