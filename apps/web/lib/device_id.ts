/** 设备级持久标识（浏览器 localStorage；用于游客 ID 绑定） */

const DEVICE_KEY = 'presto_device_id';
const DEVICE_GUEST_MAP_KEY = 'presto_device_guest_map';

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

/** 由设备 ID 确定性生成 10 位数字用户码（与后端 X-User-Code 格式一致） */
export function deviceIdToUserCode(deviceId: string): string {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i += 1) {
    hash = (Math.imul(31, hash) + deviceId.charCodeAt(i)) | 0;
  }
  const n = (Math.abs(hash) % 9_000_000_000) + 1_000_000_000;
  return String(n);
}

/** 读取/写入设备与游客 ID 的绑定 */
export function getDeviceBoundGuestId(): string | null {
  const deviceId = getDeviceId();
  if (!deviceId) return null;
  const map = readMap();
  const g = map[deviceId];
  return g && /^\d{10}$/.test(g) ? g : null;
}

export function bindDeviceGuestId(guestCode: string) {
  const deviceId = getDeviceId();
  if (!deviceId || !/^\d{10}$/.test(guestCode)) return;
  const map = readMap();
  map[deviceId] = guestCode;
  writeMap(map);
}
