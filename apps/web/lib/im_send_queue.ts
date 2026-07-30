/** 失败消息队列：文本 localStorage；媒体 IndexedDB（PWA 刷新可重发）。 */

export type QueuedTextSend = {
  id: string;
  scope: 'group' | 'dm';
  refId: string;
  body: string;
  replyToId?: string;
  mentions?: string[];
  kind?: string;
  ref?: string;
};

const STORAGE_KEY = 'presto_im_failed_text_v1';
const IDB_NAME = 'presto_im_media_outbox';
const IDB_STORE = 'files';
const IDB_VER = 1;

const mediaFiles = new Map<string, File>();

function readAll(): QueuedTextSend[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? (raw as QueuedTextSend[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: QueuedTextSend[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueueFailedText(item: QueuedTextSend) {
  const all = readAll();
  if (!all.some((x) => x.id === item.id)) {
    all.push(item);
    writeAll(all);
  }
}

export function dequeueFailedText(id: string) {
  const all = readAll().filter((x) => x.id !== id);
  writeAll(all);
}

export function listFailedText(scope: 'group' | 'dm', refId: string): QueuedTextSend[] {
  return readAll().filter((x) => x.scope === scope && x.refId === refId);
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(tempId: string, file: File) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(
        {
          blob: file,
          name: file.name,
          type: file.type,
          lastModified: file.lastModified,
        },
        tempId,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function idbGet(tempId: string): Promise<File | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  const row = await new Promise<{
    blob: Blob;
    name: string;
    type: string;
    lastModified?: number;
  } | undefined>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(tempId);
      req.onsuccess = () => resolve(req.result || undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
  db.close();
  if (!row?.blob) return undefined;
  return new File([row.blob], row.name || 'media.bin', {
    type: row.type || row.blob.type || 'application/octet-stream',
    lastModified: row.lastModified || Date.now(),
  });
}

async function idbDel(tempId: string) {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(tempId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export function rememberMediaFile(tempId: string, file: File) {
  mediaFiles.set(tempId, file);
  void idbPut(tempId, file);
}

export function takeMediaFile(tempId: string): File | undefined {
  const f = mediaFiles.get(tempId);
  mediaFiles.delete(tempId);
  void idbDel(tempId);
  return f;
}

export function peekMediaFile(tempId: string): File | undefined {
  return mediaFiles.get(tempId);
}

/** 异步取媒体（内存优先，否则 IndexedDB） */
export async function loadMediaFile(tempId: string): Promise<File | undefined> {
  const mem = mediaFiles.get(tempId);
  if (mem) return mem;
  const disk = await idbGet(tempId);
  if (disk) mediaFiles.set(tempId, disk);
  return disk;
}

export function allFailedTextCount(): number {
  return readAll().length;
}

/** 已上传成功但发送失败：只存 storage_key，重发无需再传文件 */
export type QueuedMediaMeta = {
  id: string;
  scope: 'group' | 'dm';
  refId: string;
  storage_key: string;
  file_name?: string;
  mime?: string;
  size_bytes?: number;
  url?: string;
  body?: string;
  replyToId?: string;
  mentions?: string[];
  kind?: string;
};

const MEDIA_META_KEY = 'presto_im_failed_media_meta_v1';

function readMediaMeta(): QueuedMediaMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(MEDIA_META_KEY) || '[]');
    return Array.isArray(raw) ? (raw as QueuedMediaMeta[]) : [];
  } catch {
    return [];
  }
}

function writeMediaMeta(items: QueuedMediaMeta[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MEDIA_META_KEY, JSON.stringify(items.slice(-80)));
}

export function enqueueFailedMediaMeta(item: QueuedMediaMeta) {
  const all = readMediaMeta().filter((x) => x.id !== item.id);
  all.push(item);
  writeMediaMeta(all);
}

export function dequeueFailedMediaMeta(id: string) {
  writeMediaMeta(readMediaMeta().filter((x) => x.id !== id));
}

export function peekFailedMediaMeta(id: string): QueuedMediaMeta | undefined {
  return readMediaMeta().find((x) => x.id === id);
}

export function listFailedMediaMeta(scope: 'group' | 'dm', refId: string): QueuedMediaMeta[] {
  return readMediaMeta().filter((x) => x.scope === scope && x.refId === refId);
}
