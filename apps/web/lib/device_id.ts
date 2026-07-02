/** 设备级持久标识（PWA：硬件级指纹 + 多层备份；原生 App 见 mobile device_id.dart） */

import { deviceIdToUserCode, isUserCode } from './user_code';

export { deviceIdToUserCode } from './user_code';

const DEVICE_KEY = 'presto_device_id';
const DEVICE_GUEST_MAP_KEY = 'presto_device_guest_map';
const COOKIE_KEY = 'presto_did';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10;
const IDB_NAME = 'presto_identity';
const IDB_STORE = 'kv';
const IDB_USER_CODE_KEY = 'user_code';
const IDB_DEVICE_ID_KEY = 'device_id';
const IDB_GUEST_MAP_KEY = 'device_guest_map';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn';

let resolvedDeviceId: string | null = null;
let resolvedHardwareId: string | null = null;
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

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function osFamily(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mac/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'win';
  return 'other';
}

function canvasFingerprint(): string {
  try {
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 60;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#4f6b5d';
    ctx.fillRect(0, 0, 220, 60);
    ctx.fillStyle = '#fff';
    ctx.fillText('presto-device-v1', 4, 18);
    return c.toDataURL();
  } catch {
    return '';
  }
}

function webglFingerprint(): string {
  try {
    const c = document.createElement('canvas');
    const gl =
      c.getContext('webgl') ||
      (c.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      return `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)}|${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}`;
    }
    return String(gl.getParameter(gl.VERSION));
  } catch {
    return '';
  }
}

/**
 * 硬件级设备指纹（Web 在 PWA 内无法读 IMEI，用 GPU/Canvas 等稳定信号模拟）。
 * 同一物理设备重装 PWA 后应保持一致（不含屏幕分辨率等易变项）。
 */
export async function computeHardwareLikeDeviceId(): Promise<string> {
  if (resolvedHardwareId) return resolvedHardwareId;
  if (typeof window === 'undefined') return '';

  const parts = [
    osFamily(navigator.userAgent),
    navigator.platform,
    navigator.language,
    (navigator.languages || []).join(','),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.maxTouchPoints ?? 0),
    webglFingerprint(),
    canvasFingerprint(),
  ];
  const hex = (await sha256Hex(parts.join('\0'))).slice(0, 32);
  resolvedHardwareId = `dev-${hex}`;
  return resolvedHardwareId;
}

/** 同步读取已缓存的硬件指纹（须在 resolveDeviceId 之后调用） */
export function stableDeviceFingerprint(): string {
  return resolvedHardwareId || resolvedDeviceId || readCookieDeviceId() || '';
}

function readCookieDeviceId(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_KEY}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookieDeviceId(id: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(id)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
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
    /* 备份失败不阻断 */
  }
}

async function lookupServerUserCode(deviceId: string, fingerprint: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ device_id: deviceId });
    if (fingerprint && fingerprint !== deviceId) params.set('fingerprint', fingerprint);
    const res = await fetch(`${API_BASE}/auth/device-user?${params}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const d = (await res.json()) as { user_code?: string | null };
    return d.user_code && isUserCode(d.user_code) ? d.user_code : null;
  } catch {
    return null;
  }
}

async function loadFromServiceWorker(): Promise<string | null> {
  const controller = navigator.serviceWorker?.controller;
  if (typeof navigator === 'undefined' || !controller) return null;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 600);
    const ch = new MessageChannel();
    ch.port1.onmessage = (ev: MessageEvent<{ deviceId?: string | null }>) => {
      window.clearTimeout(timer);
      resolve(typeof ev.data?.deviceId === 'string' ? ev.data.deviceId : null);
    };
    controller.postMessage({ type: 'identity-load' }, [ch.port2]);
  });
}

function syncToServiceWorker(deviceId: string, userCode?: string | null) {
  const controller = navigator.serviceWorker?.controller;
  if (typeof navigator === 'undefined' || !controller) return;
  controller.postMessage({
    type: 'identity-save',
    deviceId,
    userCode: userCode ?? null,
  });
}

async function requestPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    /* 忽略 */
  }
}

function persistDeviceId(id: string) {
  localStorage.setItem(DEVICE_KEY, id);
  writeCookieDeviceId(id);
  resolvedDeviceId = id;
  if (id.startsWith('dev-')) resolvedHardwareId = id;
}

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
  if (deviceId) syncToServiceWorker(deviceId, userCode);
}

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

export async function hydrateIdentityFromIdb(): Promise<void> {
  if (typeof window === 'undefined') return;
  const backup = await restoreIdentity();
  if (backup.deviceId && !localStorage.getItem(DEVICE_KEY)) {
    localStorage.setItem(DEVICE_KEY, backup.deviceId);
    writeCookieDeviceId(backup.deviceId);
  }
  if (backup.guestMap && !localStorage.getItem(DEVICE_GUEST_MAP_KEY)) {
    writeMap(backup.guestMap);
  }
  if (backup.userCode && !localStorage.getItem('presto_guest_id')) {
    localStorage.setItem('presto_guest_id', backup.userCode);
  }
}

/**
 * 解析设备 ID：Cookie → localStorage → IndexedDB → Service Worker → 硬件指纹。
 * 无本地缓存时用硬件指纹作为唯一 device_id（同设备重装后一致）。
 */
export async function resolveDeviceId(): Promise<string> {
  if (resolvedDeviceId) return resolvedDeviceId;
  if (typeof window === 'undefined') return '';

  await requestPersistentStorage();
  await hydrateIdentityFromIdb();

  let d =
    readCookieDeviceId() ||
    localStorage.getItem(DEVICE_KEY) ||
    (await idbGet(IDB_DEVICE_ID_KEY)) ||
    (await loadFromServiceWorker());

  const hardwareId = await computeHardwareLikeDeviceId();

  if (!d) {
    const fromServer = await lookupServerUserCode(hardwareId, hardwareId);
    if (fromServer) {
      localStorage.setItem('presto_guest_id', fromServer);
    }
    d = hardwareId;
  }

  persistDeviceId(d);
  await backupIdentity({ deviceId: d });
  return d;
}

export function getDeviceId(): string {
  if (resolvedDeviceId) return resolvedDeviceId;
  if (typeof window === 'undefined') return '';
  return readCookieDeviceId() || localStorage.getItem(DEVICE_KEY) || '';
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
