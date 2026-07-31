/** 想法云同步 outbox（apply 在 sync.ts） */

import { enqueue, type Envelope } from './sync';
import { userLsGet, userLsSet } from './user_storage';

const VER_MAP_KEY = 'thought_sync_versions_v1';

function readVers(): Record<string, number> {
  try {
    return JSON.parse(userLsGet(VER_MAP_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeVers(m: Record<string, number>) {
  userLsSet(VER_MAP_KEY, JSON.stringify(m));
}

function bumpVersion(id: string): number {
  const vers = readVers();
  const next = (vers[id] ?? 0) + 1;
  vers[id] = next;
  writeVers(vers);
  return next;
}

export function remoteVersionForThought(id: string): number {
  return readVers()[id] ?? 0;
}

export function recordRemoteThought(id: string, version: number) {
  const vers = readVers();
  vers[id] = version;
  writeVers(vers);
}

export function clearThoughtSyncMeta(id: string) {
  const vers = readVers();
  delete vers[id];
  writeVers(vers);
}

export function enqueueThought(opts: {
  id: string;
  ref: string;
  body: string;
  visibility: string;
  createdAtMs: number;
  isDelete?: boolean;
}) {
  const version = bumpVersion(opts.id);
  const env: Envelope = {
    entity: 'thought',
    op: opts.isDelete ? 'delete' : 'update',
    id: opts.id,
    version,
    client_ts: new Date().toISOString(),
    ...(opts.isDelete
      ? {}
      : {
          data: {
            ref: opts.ref,
            body: opts.body,
            visibility: opts.visibility,
            created_at_ms: opts.createdAtMs,
          },
        }),
  };
  enqueue(env);
  if (opts.isDelete) clearThoughtSyncMeta(opts.id);
}

/** 确保本地想法 id 为 UUID，便于服务端主键 */
export function ensureThoughtSyncId(existing?: string): string {
  if (
    existing &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      existing,
    )
  ) {
    return existing;
  }
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0').slice(-12)}`;
}
