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

let resolvedDeviceId: string | null = null;
let identityBootstrapped = false;

export interface IdentityBackup {
  userCode: string | null;
  deviceId: string | null;
  guestMap: Record<string, string> | null;
}

export function isIdentityBootstrapped(): boolean {
  return identityBootstrapped;
}

export function markIdentityBootstrapped(): void {
  identityBootstrapped = true;
}

/** 浏览器/设备稳定指纹（PWA 重装后 localStorage/IDB 清空时仍一致） */
export function stableDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';
  const parts = [
    navigator.userAgent,
    navigator.platform,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(window.devicePixelRatio),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? 0),
  ];
  let hash = 0;
  const s = parts.join('\0');
  for (let i = 0; i < s.length; i += 1) {
    hash = (Math.imul(31, hash) + s.charCodeAt(i)) | 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `fp-${hex}`;
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

/**
 * 解析并持久化 device_id：IDB → localStorage → 稳定指纹（不再随机 UUID）。
 * 必须在 guestId / register 之前 await。
 */
export async function resolveDeviceId(): Promise<string> {
  if (resolvedDeviceId) return resolvedDeviceId;
  if (typeof window === 'undefined') return '';

  await hydrateIdentityFromIdb();

  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) d = stableDeviceFingerprint();
  localStorage.setItem(DEVICE_KEY, d);
  resolvedDeviceId = d;
  await backupIdentity({ deviceId: d });
  return d;
}

/** 已解析的设备 ID；未 bootstrap 前不创建新 ID */
export function getDeviceId(): string {
  if (resolvedDeviceId) return resolvedDeviceId;
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(DEVICE_KEY) || '';
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
