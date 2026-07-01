// H5 云同步客户端：outbox 上行（/sync/push）+ 游标下行（/sync/pull）。
// 与 App（apps/mobile/lib/core/sync/sync_engine.dart）和后端 registry 对齐。
// 登录后（X-User-Id）才会真正同步；游客仅本地排队，登录后一次推送。

import { API_BASE, currentUserId, guestId } from './api';
import { applyRemoteNote, type LocalNote } from './notes';
import { applyRemotePlanProgress } from './plan_sync';

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
const DEVICE_KEY = 'presto_device_id';

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

function deviceId(): string {
  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) {
    d =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `web-${Date.now()}`;
    localStorage.setItem(DEVICE_KEY, d);
  }
  return d;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const uid = currentUserId();
  if (uid) h['X-User-Id'] = uid;
  const g = guestId();
  if (g) h['X-Guest-Id'] = g;
  h['X-Device-Id'] = deviceId();
  return h;
}

async function push(): Promise<number> {
  const outbox = readOutbox();
  if (outbox.length === 0) return 0;
  const res = await fetch(`${API_BASE}/sync/push`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ changes: outbox }),
  });
  if (!res.ok) throw new Error(`推送失败 ${res.status}`);
  writeOutbox([]); // 服务端已用 LWW 合并，清空本地待推送
  const data = await res.json();
  return (data.applied ?? 0) as number;
}

async function pull(): Promise<number> {
  const since = Number(localStorage.getItem(CURSOR_KEY) || '0');
  const res = await fetch(
    `${API_BASE}/sync/pull?since=${since}&entities=note,plan_progress`,
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
    } | null;
    keys?: { plan_id?: string };
  }>;
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
  }
  if (data.cursor != null) localStorage.setItem(CURSOR_KEY, String(data.cursor));
  return changes.length;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

// 完整一轮同步：先推后拉。未登录抛错（调用方提示登录）。
export async function syncNow(): Promise<SyncResult> {
  if (!currentUserId()) throw new Error('未登录');
  const pushed = await push();
  const pulled = await pull();
  return { pushed, pulled };
}
