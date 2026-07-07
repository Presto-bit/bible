/** 轻量 IndexedDB 封装（离线经库存储）。 */

const DB_NAME = 'presto_offline';
const STORE = 'blobs';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(key: string): Promise<ArrayBuffer | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      const v = req.result;
      if (v == null) resolve(null);
      else if (v instanceof ArrayBuffer) resolve(v);
      else resolve(null);
    };
    req.onerror = () => reject(req.error);
  });
}

/** 读取结构化离线包（多文件 bundle） */
export async function idbGetBundle(
  key: string,
): Promise<Record<string, ArrayBuffer> | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      const v = req.result;
      if (!v || v instanceof ArrayBuffer) {
        resolve(null);
        return;
      }
      resolve(v as Record<string, ArrayBuffer>);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: ArrayBuffer): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbSetBundle(
  key: string,
  value: Record<string, ArrayBuffer>,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
