// 高亮云同步 outbox（apply 在 sync.ts）

import { enqueue, type Envelope } from './sync';
import type { HighlightColor } from './reader_highlights';
import { userLsGet, userLsSet } from './user_storage';

const ID_MAP_KEY = 'highlight_sync_ids_v1';
const VER_MAP_KEY = 'highlight_sync_versions_v1';

function readIds(): Record<string, string> {
  try {
    return JSON.parse(userLsGet(ID_MAP_KEY) || '{}');
  } catch {
    return {};
  }
}

function readVers(): Record<string, number> {
  try {
    return JSON.parse(userLsGet(VER_MAP_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeIds(m: Record<string, string>) {
  userLsSet(ID_MAP_KEY, JSON.stringify(m));
}

function writeVers(m: Record<string, number>) {
  userLsSet(VER_MAP_KEY, JSON.stringify(m));
}

export function highlightIdForRef(ref: string): string {
  const ids = readIds();
  if (ids[ref]) return ids[ref];
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `hl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  ids[ref] = id;
  writeIds(ids);
  return id;
}

function bumpVersion(ref: string): number {
  const vers = readVers();
  const next = (vers[ref] ?? 0) + 1;
  vers[ref] = next;
  writeVers(vers);
  return next;
}

export function enqueueHighlight(ref: string, color: HighlightColor, isDelete: boolean) {
  const id = highlightIdForRef(ref);
  const version = bumpVersion(ref);
  const env: Envelope = {
    entity: 'highlight',
    op: isDelete ? 'delete' : 'update',
    id,
    version,
    client_ts: new Date().toISOString(),
    ...(isDelete ? {} : { data: { ref, color } }),
  };
  enqueue(env);
  if (isDelete) {
    const ids = readIds();
    const vers = readVers();
    delete ids[ref];
    delete vers[ref];
    writeIds(ids);
    writeVers(vers);
  }
}

export function recordRemoteHighlight(ref: string, id: string, version: number) {
  const ids = readIds();
  const vers = readVers();
  ids[ref] = id;
  vers[ref] = version;
  writeIds(ids);
  writeVers(vers);
}

export function clearHighlightSyncMeta(ref: string) {
  const ids = readIds();
  const vers = readVers();
  delete ids[ref];
  delete vers[ref];
  writeIds(ids);
  writeVers(vers);
}

export function remoteVersionForRef(ref: string): number {
  return readVers()[ref] ?? 0;
}
