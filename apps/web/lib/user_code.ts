/** 用户 ID 格式：新用户 8 位数字；兼容历史 10 位。 */

export const USER_CODE_LEN = 8;
export const USER_CODE_RE = /^\d{8}$/;
export const LEGACY_USER_CODE_RE = /^\d{10}$/;

export function isUserCode(value: string): boolean {
  return USER_CODE_RE.test(value) || LEGACY_USER_CODE_RE.test(value);
}

/** 由设备 ID 确定性生成 8 位用户码（与 App 端算法一致）。 */
export function deviceIdToUserCode(deviceId: string): string {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i += 1) {
    hash = (Math.imul(31, hash) + deviceId.charCodeAt(i)) | 0;
  }
  const n = (Math.abs(hash) % 90_000_000) + 10_000_000;
  return String(n);
}
