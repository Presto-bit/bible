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
 * 硬件级弱指纹（同型号手机 GPU/Canvas 常相同，不可单独作为身份）。
 * 仅作辅助信号，不作为 device_id，也不用于自动合并账号。
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

/** 安装级唯一设备 ID：每台设备首次打开生成，避免同型号硬件指纹撞号 */
function newInstallDeviceId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `inst-${uuid}`.slice(0, 128);
}

function isWeakHardwareDeviceId(id: string): boolean {
  return id.startsWith('dev-');
}

/** 同步读取已缓存的硬件指纹（须在 resolveDeviceId 之后调用） */
export function stableDeviceFingerprint(): string {
  return resolvedHardwareId || '';
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
 * 解析设备 ID：Cookie → localStorage → IndexedDB → Service Worker → 新安装 UUID。
 * 不再用硬件指纹当 device_id（同型号会撞号，导致两台手机共用一个用户 ID）。
 */
export async function resolveDeviceId(): Promise<string> {
  if (resolvedDeviceId) return resolvedDeviceId;
  if (typeof window === 'undefined') return '';

  await requestPersistentStorage();
  await hydrateIdentityFromIdb();

  // 始终计算弱指纹供调试，但不参与身份绑定
  await computeHardwareLikeDeviceId();

  let d =
    readCookieDeviceId() ||
    localStorage.getItem(DEVICE_KEY) ||
    (await idbGet(IDB_DEVICE_ID_KEY)) ||
    (await loadFromServiceWorker());

  // 旧版 dev-* 为硬件指纹，同型号会共享同一 user_code。
  // 升级时丢弃弱 device_id 与本地 guest，强制新身份；原账号用「用户名/手机号+密码」恢复。
  if (d && isWeakHardwareDeviceId(d)) {
    const map = readMap();
    delete map[d];
    writeMap(map);
    localStorage.removeItem('presto_guest_id');
    localStorage.removeItem('presto_user_id');
    localStorage.removeItem('account_phone');
    localStorage.removeItem('account_phone_owner');
    try {
      await idbSet(IDB_USER_CODE_KEY, '');
      await idbSet(IDB_DEVICE_ID_KEY, '');
      await idbSet(IDB_GUEST_MAP_KEY, '{}');
    } catch {
      /* ignore */
    }
    d = '';
  }

  if (!d) {
    d = newInstallDeviceId();
  }

  persistDeviceId(d);
  await backupIdentity({ deviceId: d });
  return d;
}

/** 清除本机身份与设备绑定，下次打开将生成新用户 ID（用于误绑他人账号时自救） */
export async function resetInstallIdentity(): Promise<void> {
  if (typeof window === 'undefined') return;
  const oldDevice = getDeviceId();
  localStorage.removeItem(DEVICE_KEY);
  localStorage.removeItem(DEVICE_GUEST_MAP_KEY);
  localStorage.removeItem('presto_guest_id');
  localStorage.removeItem('presto_user_id');
  localStorage.removeItem('account_phone');
  localStorage.removeItem('account_phone_owner');
  localStorage.removeItem('profile_name');
  localStorage.removeItem('account_has_password');
  localStorage.removeItem('account_onboarded');
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
  }
  if (oldDevice) {
    const map = readMap();
    delete map[oldDevice];
    writeMap(map);
  }
  try {
    await idbSet(IDB_USER_CODE_KEY, '');
    await idbSet(IDB_DEVICE_ID_KEY, '');
    await idbSet(IDB_GUEST_MAP_KEY, '{}');
  } catch {
    /* ignore */
  }
  resolvedDeviceId = null;
  resolvedHardwareId = null;
  identityBootstrapped = false;
  const controller = navigator.serviceWorker?.controller;
  controller?.postMessage({ type: 'identity-save', deviceId: null, userCode: null });
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

/** 清除本机当前 device 上的 guest 映射与 IDB 用户码（保留 device_id） */
export function clearDeviceGuestBinding(): void {
  const deviceId = getDeviceId();
  if (deviceId) {
    const map = readMap();
    delete map[deviceId];
    writeMap(map);
  }
  void idbSet(IDB_USER_CODE_KEY, '');
  const controller = navigator.serviceWorker?.controller;
  if (deviceId) {
    controller?.postMessage({ type: 'identity-save', deviceId, userCode: null });
  }
}
