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
import { mergeRemoteReadingLog } from './reading_log_sync';
import { mergeRemoteReadEvent } from './read_event_sync';
import { applyRemoteBadgeUnlock } from './badge_unlock_sync';
import { SYNC_PULL_ENTITIES } from './sync_contract';
import { removeHighlight, setHighlight, type HighlightColor } from './reader_highlights';
import { notifyLocalDataChanged } from './local_data_events';
import {
  dropLegacyGlobalSyncKeys,
  getSyncCursor,
  migrateLegacyOutboxIfNeeded,
  outboxStorageKey,
  resetSyncCursor,
  setSyncCursor,
  syncAccountId,
} from './sync_account';

let syncPullDepth = 0;

export function isSyncPullActive(): boolean {
  return syncPullDepth > 0;
}

export interface Envelope {
  entity: string;
  op: 'update' | 'delete';
  id?: string;
  keys?: Record<string, unknown>;
  version?: number;
  client_ts?: string;
  data?: Record<string, unknown>;
}

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

function readOutbox(userCode?: string): Envelope[] {
  if (typeof window === 'undefined') return [];
  migrateLegacyOutboxIfNeeded(userCode);
  try {
    const raw = JSON.parse(localStorage.getItem(outboxStorageKey(userCode)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: Envelope[], userCode?: string) {
  localStorage.setItem(outboxStorageKey(userCode), JSON.stringify(items));
}

export function enqueue(env: Envelope) {
  if (typeof window === 'undefined') return;
  writeOutbox([...readOutbox(), env]);
}

export function pendingCount(): number {
  return readOutbox().length;
}

async function push(): Promise<number> {
  const userCode = syncAccountId();
  const outbox = readOutbox(userCode);
  if (outbox.length === 0) return 0;
  markSyncStart();
  try {
    const res = await fetch(`${API_BASE}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ changes: outbox }),
    });
    if (!res.ok) throw new Error(`推送失败 ${res.status}`);
    const data = await res.json();
    const errors = Array.isArray(data.errors) ? data.errors : [];
    // 有实体写入失败时保留 outbox，避免 reading_log 等被误清
    if (errors.length === 0) {
      writeOutbox([], userCode);
    }
    return (data.applied ?? 0) as number;
  } finally {
    markSyncDone();
  }
}

type PullChange = {
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
    verse?: number | null;
    minutes?: number;
    chapters?: number;
    ts?: number;
    badge_id?: string;
    unlocked_at?: number;
    avatar_id?: string;
  } | null;
  keys?: { plan_id?: string; date?: string };
};

function applyPullChanges(changes: PullChange[]): number {
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
      applyRemoteReadingProgress(c.data, c.updated_at);
    }
    if (c.entity === 'reading_log' && c.op === 'update' && c.keys?.date) {
      mergeRemoteReadingLog(c.keys.date, c.data);
    }
    if (c.entity === 'read_event' && c.op === 'update' && c.id) {
      mergeRemoteReadEvent({ id: c.id, ...c.data });
    }
    if (c.entity === 'badge_unlock' && c.op === 'update') {
      applyRemoteBadgeUnlock(c.data, { silent: true });
    }
    if (c.entity === 'user_profile' && c.op === 'update') {
      applyRemoteProfile(c.data);
    }
  }
  if (aiSessionChanges.length > 0) {
    applyRemoteAiSessionPull(aiSessionChanges);
  }
  if (changes.length > 0) {
    void import('./badge_unlock').then((m) => m.runBadgeRecheck());
    notifyLocalDataChanged('sync-pull');
    void import('./reading_durable').then((m) => m.scheduleReadingSnapshotBackup());
  }
  return changes.length;
}

async function pullOnce(userCode?: string): Promise<{ count: number; hasMore: boolean }> {
  const id = syncAccountId(userCode);
  const since = getSyncCursor(id);
  const res = await fetch(
    `${API_BASE}/sync/pull?since=${since}&entities=${SYNC_PULL_ENTITIES.join(',')}`,
    { headers: authHeaders(), cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`拉取失败 ${res.status}`);
  const data = await res.json();
  const changes = (data.changes ?? []) as PullChange[];
  const count = applyPullChanges(changes);
  if (data.cursor != null) setSyncCursor(id, Number(data.cursor));
  return { count, hasMore: Boolean(data.has_more) };
}

async function pullAll(userCode?: string): Promise<number> {
  markSyncStart();
  syncPullDepth += 1;
  try {
    let total = 0;
    for (let guard = 0; guard < 200; guard += 1) {
      const { count, hasMore } = await pullOnce(userCode);
      total += count;
      if (!hasMore) break;
    }
    return total;
  } finally {
    syncPullDepth -= 1;
    markSyncDone();
  }
}

async function pull(): Promise<number> {
  markSyncStart();
  syncPullDepth += 1;
  try {
    const { count } = await pullOnce();
    return count;
  } finally {
    syncPullDepth -= 1;
    markSyncDone();
  }
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

export type SyncOptions = {
  /** 先拉后推（登录/合并场景，避免未拉全就上行覆盖） */
  pullFirst?: boolean;
  /** 重置游标并分页拉全量 */
  fullPull?: boolean;
};

// 完整一轮同步。默认先推后拉（离线编辑优先）；登录/合并用 pullFirst + fullPull。
export async function syncNow(opts: SyncOptions = {}): Promise<SyncResult> {
  await ensureAccountReady();
  const uid = effectiveId();
  if (!uid) throw new Error('账号未就绪');
  dropLegacyGlobalSyncKeys();
  migrateLegacyOutboxIfNeeded(uid);

  if (opts.fullPull) resetSyncCursor(uid);

  if (opts.pullFirst) {
    const pulled = opts.fullPull ? await pullAll(uid) : await pull();
    const pushed = await push();
    const pulledAfter = await pull();
    return { pushed, pulled: pulled + pulledAfter };
  }

  const pushed = await push();
  const pulled = opts.fullPull ? await pullAll(uid) : await pull();
  return { pushed, pulled };
}

/** 登录/换号：游标归零 → 拉全量 → 推 outbox → 再拉增量 */
export async function syncResyncAccount(): Promise<SyncResult> {
  return syncNow({ pullFirst: true, fullPull: true });
}

/** 仅从云端拉取（合并弹窗「暂不合并」：先补齐云端，不上行本机迁移） */
export async function syncPullFirst(): Promise<SyncResult> {
  return syncNow({ pullFirst: true, fullPull: true });
}
