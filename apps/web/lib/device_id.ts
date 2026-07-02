/** 设备级持久标识（浏览器 localStorage；用于游客 ID 绑定） */

import { deviceIdToUserCode, isUserCode } from './user_code';

export { deviceIdToUserCode } from './user_code';

const DEVICE_KEY = 'presto_device_id';
const DEVICE_GUEST_MAP_KEY = 'presto_device_guest_map';
const IDB_NAME = 'presto_identity';
const IDB_STORE = 'kv';
const IDB_USER_CODE_KEY = 'user_code';

function readMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(DEVICE_GUEST_MAP_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  localStorage.setItem(DEVICE_GUEST_MAP_KEY, JSON.stringify(map));
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB 备份 user_code，清 localStorage 后仍可恢复（P2） */
export async function backupUserCode(code: string): Promise<void> {
  if (typeof indexedDB === 'undefined' || !isUserCode(code)) return;
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(code, IDB_USER_CODE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* 备份失败不阻断主流程 */
  }
}

/** 从 IndexedDB 恢复 user_code */
export async function restoreUserCode(): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openIdb();
    const code = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_USER_CODE_KEY);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return code && isUserCode(code) ? code : null;
  } catch {
    return null;
  }
}

/** 本设备 UUID（首次生成后不变，清站点数据会重置） */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) {
    d =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_KEY, d);
  }
  return d;
}

export function getDeviceBoundGuestId(): string | null {
  const deviceId = getDeviceId();
  if (!deviceId) return null;
  const map = readMap();
  const g = map[deviceId];
  return g && isUserCode(g) ? g : null;
}

export function bindDeviceGuestId(guestCode: string) {
  const deviceId = getDeviceId();
  if (!deviceId || !isUserCode(guestCode)) return;
  const map = readMap();
  map[deviceId] = guestCode;
  writeMap(map);
  void backupUserCode(guestCode);
}
