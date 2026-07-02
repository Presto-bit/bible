/** 设备级持久标识 + IndexedDB 备份（PWA 删书签后尽量恢复同一用户 ID） */

import { deviceIdToUserCode, isUserCode } from './user_code';

export { deviceIdToUserCode } from './user_code';

const DEVICE_KEY = 'presto_device_id';
const DEVICE_GUEST_MAP_KEY = 'presto_device_guest_map';
const IDB_NAME = 'presto_identity';
const IDB_STORE = 'kv';
const IDB_USER_CODE_KEY = 'user_code';
const IDB_DEVICE_ID_KEY = 'device_id';
const IDB_GUEST_MAP_KEY = 'device_guest_map';

export interface IdentityBackup {
  userCode: string | null;
  deviceId: string | null;
  guestMap: Record<string, string> | null;
}

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
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openIdb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* 备份失败不阻断主流程 */
  }
}

/** 将 device_id / user_code / 映射表写入 IndexedDB */
export async function backupIdentity(opts?: {
  userCode?: string | null;
  deviceId?: string | null;
  guestMap?: Record<string, string> | null;
}): Promise<void> {
  const userCode = opts?.userCode ?? null;
  const deviceId = opts?.deviceId ?? null;
  const guestMap = opts?.guestMap ?? null;
  if (userCode && isUserCode(userCode)) await idbSet(IDB_USER_CODE_KEY, userCode);
  if (deviceId) await idbSet(IDB_DEVICE_ID_KEY, deviceId);
  if (guestMap) await idbSet(IDB_GUEST_MAP_KEY, JSON.stringify(guestMap));
}

/** @deprecated 使用 backupIdentity */
export async function backupUserCode(code: string): Promise<void> {
  await backupIdentity({ userCode: code });
}

/** 从 IndexedDB 读取完整身份备份 */
export async function restoreIdentity(): Promise<IdentityBackup> {
  const [userCode, deviceId, mapRaw] = await Promise.all([
    idbGet(IDB_USER_CODE_KEY),
    idbGet(IDB_DEVICE_ID_KEY),
    idbGet(IDB_GUEST_MAP_KEY),
  ]);
  let guestMap: Record<string, string> | null = null;
  if (mapRaw) {
    try {
      guestMap = JSON.parse(mapRaw) as Record<string, string>;
    } catch {
      guestMap = null;
    }
  }
  return {
    userCode: userCode && isUserCode(userCode) ? userCode : null,
    deviceId: deviceId || null,
    guestMap,
  };
}

/** @deprecated 使用 restoreIdentity */
export async function restoreUserCode(): Promise<string | null> {
  const id = await restoreIdentity();
  return id.userCode;
}

/**
 * 启动时从 IndexedDB 恢复 localStorage（PWA 删书签后 localStorage 常丢，IDB 往往还在）。
 */
export async function hydrateIdentityFromIdb(): Promise<void> {
  if (typeof window === 'undefined') return;
  const backup = await restoreIdentity();
  if (backup.deviceId && !localStorage.getItem(DEVICE_KEY)) {
    localStorage.setItem(DEVICE_KEY, backup.deviceId);
  }
  if (backup.guestMap && !localStorage.getItem(DEVICE_GUEST_MAP_KEY)) {
    writeMap(backup.guestMap);
  }
  if (backup.userCode && !localStorage.getItem('presto_guest_id')) {
    localStorage.setItem('presto_guest_id', backup.userCode);
  }
}

/** 本设备 UUID（首次生成后不变；清 localStorage 后从 IDB 恢复） */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) {
    d =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_KEY, d);
    void backupIdentity({ deviceId: d });
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
  void backupIdentity({ userCode: guestCode, deviceId, guestMap: map });
}
