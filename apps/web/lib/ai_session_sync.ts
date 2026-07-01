/** 小爱会话元数据云同步（title + anchor_ref），消息历史仅本地。 */

import { currentUserId } from './api';
import { enqueue, type Envelope } from './sync';

export interface AiSessionMeta {
  id: string;
  title: string;
  anchor_ref: string;
  version: number;
  updatedAt: number;
}

const VERSION_KEY = 'presto_ai_session_versions';
const SESSIONS_KEY = 'assistant_sessions_v1';

function loadLocalSessions(): Array<{
  id: string;
  title: string;
  ref: string;
  preview: string;
  updated: string;
  msgs: unknown[];
}> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalSessions(
  list: Array<{
    id: string;
    title: string;
    ref: string;
    preview: string;
    updated: string;
    msgs: unknown[];
  }>,
) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(0, 50)));
}

function readVersions(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(VERSION_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function writeVersion(id: string, version: number) {
  const map = readVersions();
  map[id] = version;
  localStorage.setItem(VERSION_KEY, JSON.stringify(map));
}

export function versionForSession(id: string): number {
  return readVersions()[id] ?? 1;
}

export function aiSessionEnvelope(meta: AiSessionMeta, isDelete: boolean): Envelope {
  return {
    entity: 'ai_session',
    op: isDelete ? 'delete' : 'update',
    id: meta.id,
    version: meta.version,
    client_ts: new Date(meta.updatedAt).toISOString(),
    ...(isDelete
      ? {}
      : {
          data: {
            title: meta.title,
            anchor_ref: meta.anchor_ref || null,
          },
        }),
  };
}

export function enqueueAiSession(meta: AiSessionMeta, isDelete = false) {
  if (!currentUserId()) return;
  enqueue(aiSessionEnvelope(meta, isDelete));
}

export function bumpAndEnqueueAiSession(
  id: string,
  title: string,
  anchorRef: string,
  isDelete = false,
): AiSessionMeta {
  const version = (readVersions()[id] ?? 0) + 1;
  const meta: AiSessionMeta = {
    id,
    title,
    anchor_ref: anchorRef,
    version,
    updatedAt: Date.now(),
  };
  writeVersion(id, version);
  enqueueAiSession(meta, isDelete);
  return meta;
}

export interface RemoteAiSession {
  id: string;
  op: string;
  version?: number | null;
  data?: { title?: string; anchor_ref?: string | null } | null;
}

/** 将远端元数据合并进本地会话列表（LWW by version）。 */
export function mergeRemoteAiSessions(
  local: Array<{
    id: string;
    title: string;
    ref: string;
    preview: string;
    updated: string;
    msgs: unknown[];
  }>,
  remote: RemoteAiSession[],
): typeof local {
  const byId = new Map(local.map((s) => [s.id, s]));
  for (const c of remote) {
    if (!c.id) continue;
    const incoming = c.version ?? 1;
    if (incoming <= versionForSession(c.id) && c.op !== 'delete') continue;
    if (c.op === 'delete') {
      byId.delete(c.id);
      writeVersion(c.id, incoming);
      continue;
    }
    const title = c.data?.title || '新会话';
    const ref = c.data?.anchor_ref || '';
    const existing = byId.get(c.id);
    if (existing) {
      byId.set(c.id, { ...existing, title, ref });
    } else {
      byId.set(c.id, {
        id: c.id,
        title,
        ref,
        preview: '',
        updated: '同步',
        msgs: [],
      });
    }
    writeVersion(c.id, incoming);
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.updated === '今天') return -1;
    if (b.updated === '今天') return 1;
    return 0;
  });
}

export function applyRemoteAiSessionPull(changes: RemoteAiSession[]): number {
  if (!changes.length) return 0;
  const merged = mergeRemoteAiSessions(loadLocalSessions(), changes);
  saveLocalSessions(merged);
  return changes.length;
}
