// H5 云同步客户端：outbox 上行（/sync/push）+ 游标下行（/sync/pull）。
// 隐式账号（user_code）默认可同步；本地 outbox 有网时自动推送。

import { API_BASE, effectiveId, ensureAccountReady, authHeaders } from './api';
import { markSyncDone, markSyncStart } from './sync_status';
import { applyRemoteNote, type LocalNote } from './notes';
import { applyRemotePlanProgress } from './plan_sync';
import {
  clearHighlightSyncMeta,
  recordRemoteHighlight,
  remoteVersionForRef,
} from './highlight_sync';
import {
  applyRemoteFavorite,
} from './favorites';
import {
  clearBookmarkSyncMeta,
  recordRemoteBookmark,
  syncVersionForRef,
} from './bookmark_sync';
import {
  applyRemoteAiSessionPull,
  type RemoteAiSession,
} from './ai_session_sync';
import { applyRemoteReadingProgress } from './reading_progress_sync';
import { applyRemoteProfile } from './profile_sync';
import { removeHighlight, setHighlight, type HighlightColor } from './reader_highlights';

export interface Envelope {
  entity: string;
  op: 'update' | 'delete';
  id?: string;
  keys?: Record<string, unknown>;
  version?: number;
  client_ts?: string;
  data?: Record<string, unknown>;
}

const OUTBOX_KEY = 'presto_outbox';
const CURSOR_KEY = 'presto_sync_cursor';

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function noteEnvelope(n: LocalNote, isDelete: boolean): Envelope {
  return {
    entity: 'note',
    op: isDelete ? 'delete' : 'update',
    id: n.id,
    version: n.version,
    client_ts: iso(n.updatedAt),
    ...(isDelete
      ? {}
      : {
          data: {
            ref: n.ref ?? null,
            body: n.body,
            tags: n.tags ?? [],
            is_private: true,
          },
        }),
  };
}

function readOutbox(): Envelope[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: Envelope[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export function enqueue(env: Envelope) {
  if (typeof window === 'undefined') return;
  writeOutbox([...readOutbox(), env]);
}

export function pendingCount(): number {
  return readOutbox().length;
}

async function push(): Promise<number> {
  const outbox = readOutbox();
  if (outbox.length === 0) return 0;
  markSyncStart();
  try {
    const res = await fetch(`${API_BASE}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ changes: outbox }),
    });
    if (!res.ok) throw new Error(`推送失败 ${res.status}`);
    writeOutbox([]);
    const data = await res.json();
    return (data.applied ?? 0) as number;
  } finally {
    markSyncDone();
  }
}

async function pull(): Promise<number> {
  markSyncStart();
  try {
    const since = Number(localStorage.getItem(CURSOR_KEY) || '0');
    const res = await fetch(
      `${API_BASE}/sync/pull?since=${since}&entities=note,plan_progress,highlight,bookmark,ai_session,reading_progress,user_profile`,
      { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) throw new Error(`拉取失败 ${res.status}`);
  const data = await res.json();
  const changes = (data.changes ?? []) as Array<{
    entity: string;
    id?: string;
    op: string;
    version?: number | null;
    updated_at?: string | null;
    data?: {
      ref?: string | null;
      body?: string;
      tags?: string[];
      day?: number;
      status?: string;
      session?: Record<string, unknown> | null;
      color?: string;
      book?: string;
      chapter?: number;
      avatar_id?: string;
    } | null;
    keys?: { plan_id?: string };
  }>;
  const aiSessionChanges: RemoteAiSession[] = [];
  for (const c of changes) {
    if (c.entity === 'note' && c.id) applyRemoteNote({ ...c, id: c.id });
    if (c.entity === 'plan_progress' && c.keys?.plan_id) {
      applyRemotePlanProgress({
        plan_id: c.keys.plan_id,
        day: c.data?.day,
        status: c.data?.status,
        session: c.data?.session,
      });
    }
    if (c.entity === 'highlight' && c.id) {
      const ref = c.data?.ref;
      if (!ref) continue;
      const incoming = c.version ?? 1;
      if (remoteVersionForRef(ref) > incoming && c.op !== 'delete') continue;
      if (c.op === 'delete') {
        removeHighlight(ref);
        clearHighlightSyncMeta(ref);
      } else {
        setHighlight(ref, (c.data?.color || 'yellow') as HighlightColor);
        recordRemoteHighlight(ref, c.id, incoming);
      }
    }
    if (c.entity === 'bookmark' && c.id) {
      const ref = c.data?.ref;
      if (!ref) continue;
      const incoming = c.version ?? 1;
      if (syncVersionForRef(ref) > incoming && c.op !== 'delete') continue;
      if (c.op === 'delete') {
        applyRemoteFavorite(ref, false);
        clearBookmarkSyncMeta(ref);
      } else {
        applyRemoteFavorite(ref, true);
        recordRemoteBookmark(ref, c.id, incoming);
      }
    }
    if (c.entity === 'ai_session' && c.id) {
      aiSessionChanges.push({
        id: c.id,
        op: c.op,
        version: c.version,
        data: c.data as RemoteAiSession['data'],
      });
    }
    if (c.entity === 'reading_progress' && c.op === 'update') {
      applyRemoteReadingProgress(c.data);
    }
    if (c.entity === 'user_profile' && c.op === 'update') {
      applyRemoteProfile(c.data);
    }
  }
  if (aiSessionChanges.length > 0) {
    applyRemoteAiSessionPull(aiSessionChanges);
  }
  if (data.cursor != null) localStorage.setItem(CURSOR_KEY, String(data.cursor));
  return changes.length;
  } finally {
    markSyncDone();
  }
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

// 完整一轮同步：先推后拉。隐式账号就绪后可用。
export async function syncNow(): Promise<SyncResult> {
  await ensureAccountReady();
  const uid = effectiveId();
  if (!uid) throw new Error('账号未就绪');
  const pushed = await push();
  const pulled = await pull();
  return { pushed, pulled };
}
