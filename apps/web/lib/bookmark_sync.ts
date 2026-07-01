// 收藏（书签）云同步

import { enqueue, type Envelope } from './sync';

const ID_MAP_KEY = 'bookmark_sync_ids_v1';
const VER_MAP_KEY = 'bookmark_sync_versions_v1';

function readIds(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ID_MAP_KEY) || '{}');
  } catch {
    return {};
  }
}

function readVers(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(VER_MAP_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeIds(m: Record<string, string>) {
  localStorage.setItem(ID_MAP_KEY, JSON.stringify(m));
}

function writeVers(m: Record<string, number>) {
  localStorage.setItem(VER_MAP_KEY, JSON.stringify(m));
}

export function bookmarkIdForRef(ref: string): string {
  const ids = readIds();
  if (ids[ref]) return ids[ref];
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `bm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export function enqueueBookmark(ref: string, isDelete: boolean) {
  const id = bookmarkIdForRef(ref);
  const version = bumpVersion(ref);
  enqueue({
    entity: 'bookmark',
    op: isDelete ? 'delete' : 'update',
    id,
    version,
    client_ts: new Date().toISOString(),
    ...(isDelete ? {} : { data: { ref } }),
  });
  if (isDelete) {
    const ids = readIds();
    const vers = readVers();
    delete ids[ref];
    delete vers[ref];
    writeIds(ids);
    writeVers(vers);
  }
}

export function syncIdForRef(ref: string): string | undefined {
  return readIds()[ref];
}

export function syncVersionForRef(ref: string): number {
  return readVers()[ref] ?? 0;
}

export function recordRemoteBookmark(ref: string, id: string, version: number) {
  const ids = readIds();
  const vers = readVers();
  ids[ref] = id;
  vers[ref] = version;
  writeIds(ids);
  writeVers(vers);
}

export function clearBookmarkSyncMeta(ref: string) {
  const ids = readIds();
  const vers = readVers();
  delete ids[ref];
  delete vers[ref];
  writeIds(ids);
  writeVers(vers);
}
